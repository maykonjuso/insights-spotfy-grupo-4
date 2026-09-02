"""Enriquece o dataset limpo com dados da Web API do Spotify.

O CSV de origem nao tem data de lancamento nem ISRC, mas tem `track_id`, que e a
chave da API. O script busca, por faixa: release_date, ISRC, dados do album e
mercados; e, por artista: generos, seguidores e popularidade.

Dois modos, escolhidos automaticamente por uma sondagem no inicio:

  lote   GET /v1/tracks?ids=...   50 por request  -> ~2.4 mil requests
  single GET /v1/tracks/{id}       1 por request  -> ~120 mil requests

O modo lote depende de o app ter acesso aos endpoints `?ids=`; alguns tokens
recebem 403 neles. O modo single funciona sempre, mas e 50x mais caro, entao usa
um pool de threads.

Autenticacao (uma das duas):
    export SPOTIFY_TOKEN=BQ...                    # token pronto, expira em ~1h
    export SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=...   # renova sozinho

Uso:
    .venv/bin/python scripts/enriquecer_spotify.py --limit 300   # teste
    .venv/bin/python scripts/enriquecer_spotify.py               # tudo

O cache fica em data/raw_api/*.jsonl (uma linha por item). O script e retomavel:
se cair, expirar o token ou for interrompido, rodar de novo continua de onde parou.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import requests

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / "data" / "processed" / "spotify_tracks_limpo.csv"
CACHE = RAIZ / "data" / "raw_api"
SAIDA = RAIZ / "data" / "processed" / "enriquecimento_spotify"

API = "https://api.spotify.com/v1"
TOKEN_URL = "https://accounts.spotify.com/api/token"
LOTE = 50

# Esta maquina fica atras de um proxy com inspecao TLS (Zscaler): o certifi que o
# requests usa por padrao nao tem a raiz do proxy, e toda chamada morre em
# SSLError. Se o usuario nao apontou um bundle, procuramos um que funcione.
def _ca_bundle() -> str | None:
    for var in ("REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE", "SSL_CERT_FILE"):
        if (caminho := os.environ.get(var)) and Path(caminho).exists():
            return caminho
    for candidato in (
        Path.home() / "zscaler-bundle.pem",
        Path("/etc/pki/tls/certs/ca-bundle.crt"),
        Path("/etc/ssl/certs/ca-certificates.crt"),
    ):
        if candidato.exists():
            return str(candidato)
    return None


CA = _ca_bundle()


TETO_ESPERA = 300  # acima disso nao e throttle, e bloqueio do app


class TokenExpirado(Exception):
    """Token cru expirou e nao ha client credentials para renovar."""


class Bloqueado(Exception):
    """429 com Retry-After longo: o app levou bloqueio, nao adianta insistir."""

    def __init__(self, segundos: int) -> None:
        self.segundos = segundos
        super().__init__(segundos)


# ---------------------------------------------------------------- autenticacao
class Cliente:
    def __init__(self, token=None, client_id=None, client_secret=None) -> None:
        self.token = token or ""
        self.fixo = bool(token)  # token cru: nao da pra renovar
        self.credencial = (
            base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
            if client_id and client_secret
            else None
        )
        self.expira_em = float("inf") if self.fixo else 0.0
        self.local = threading.local()
        self.trava = threading.Lock()
        self.pausa = threading.Event()  # setado = pode seguir
        self.pausa.set()
        self.intervalo = 0.0  # espacamento minimo entre requests (segundos)
        self.proximo = 0.0
        self.trava_ritmo = threading.Lock()

    def _aguarda_vez(self) -> None:
        """Serializa a largada das requests para respeitar --rps."""
        if not self.intervalo:
            return
        with self.trava_ritmo:
            agora = time.monotonic()
            espera = max(0.0, self.proximo - agora)
            self.proximo = max(agora, self.proximo) + self.intervalo
        if espera:
            time.sleep(espera)

    @property
    def sessao(self) -> requests.Session:
        # uma Session por thread: keep-alive sem disputa entre workers
        if not hasattr(self.local, "s"):
            self.local.s = requests.Session()
        return self.local.s

    def _renovar(self) -> None:
        with self.trava:
            if time.time() < self.expira_em:
                return  # outra thread ja renovou
            if self.credencial is None:
                raise TokenExpirado
            resp = requests.post(
                TOKEN_URL,
                data={"grant_type": "client_credentials"},
                headers={"Authorization": f"Basic {self.credencial}"},
                timeout=30,
                verify=CA or True,
            )
            if resp.status_code != 200:
                raise SystemExit(
                    f"Falha ao obter token ({resp.status_code}): {resp.text[:200]}"
                )
            d = resp.json()
            self.token = d["access_token"]
            self.expira_em = time.time() + d.get("expires_in", 3600) - 60

    def get(self, caminho: str, params: dict | None = None, cru: bool = False):
        """Retorna o JSON. Com cru=True devolve (status, json) sem levantar erro."""
        for tentativa in range(6):
            self.pausa.wait()  # respeita backoff global de 429
            self._aguarda_vez()
            if time.time() >= self.expira_em:
                self._renovar()
            r = self.sessao.get(
                f"{API}{caminho}",
                params=params,
                headers={"Authorization": f"Bearer {self.token}"},
                timeout=30,
                verify=CA or True,
            )
            if cru:
                return r.status_code, (r.json() if r.content else {})
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429:
                espera = int(r.headers.get("Retry-After", "5")) + 1
                # Retry-After curto = throttle normal, da pra esperar.
                # Retry-After longo = bloqueio duro do app (chega a 24h). Dormir
                # isso em silencio seria pior que falhar: aborta e avisa.
                if espera > TETO_ESPERA:
                    raise Bloqueado(espera)
                if self.pausa.is_set():  # segura todas as threads, nao so esta
                    self.pausa.clear()
                    print(f"  [429] pausando {espera}s", flush=True)
                    time.sleep(espera)
                    self.pausa.set()
                continue
            if r.status_code == 401:
                if self.fixo:
                    raise TokenExpirado
                self.expira_em = 0
                continue
            if r.status_code == 404:
                return None  # id que nao existe mais no catalogo
            if r.status_code >= 500:
                time.sleep(2**tentativa)
                continue
            raise SystemExit(f"Erro {r.status_code} em {caminho}: {r.text[:300]}")
        raise SystemExit(f"Desisti apos 6 tentativas em {caminho}")


# ------------------------------------------------------------------- cache
class Cache:
    """JSONL append-only: uma linha por item, retomavel, seguro entre threads."""

    def __init__(self, caminho: Path) -> None:
        self.caminho = caminho
        caminho.parent.mkdir(parents=True, exist_ok=True)
        self.itens: dict[str, dict] = {}
        if caminho.exists():
            for linha in caminho.read_text().splitlines():
                if linha.strip():
                    try:
                        d = json.loads(linha)
                        self.itens[d["id"]] = d
                    except json.JSONDecodeError:
                        pass  # linha truncada por interrupcao: ignora
        self.arquivo = caminho.open("a")
        self.trava = threading.Lock()

    def tem(self, i: str) -> bool:
        return i in self.itens

    def grava(self, d: dict) -> None:
        with self.trava:
            self.itens[d["id"]] = d
            self.arquivo.write(json.dumps(d) + "\n")

    def fecha(self) -> None:
        self.arquivo.close()


# ------------------------------------------------------------------- coleta
def coletar(cliente, ids, recurso, workers, usar_lote):
    """Baixa `ids` para o cache JSONL. Devolve a lista completa de itens."""
    cache = Cache(CACHE / f"{recurso}.jsonl")
    faltam = [i for i in ids if not cache.tem(i)]
    print(f"  {recurso}: {len(ids) - len(faltam):,} em cache, {len(faltam):,} a buscar")
    if not faltam:
        cache.fecha()
        return [cache.itens[i] for i in ids if cache.tem(i)]

    feitos = [0]
    inicio = time.time()
    parar = threading.Event()
    motivo: list[Exception | None] = [None]

    def progresso():
        feitos[0] += 1
        n = feitos[0]
        if n % 500 == 0 or n == len(faltam):
            passou = time.time() - inicio
            taxa = n / passou
            resta = (len(faltam) - n) / taxa if taxa else 0
            print(
                f"  {recurso}: {n:,}/{len(faltam):,} "
                f"({taxa:.1f}/s, ~{resta / 60:.0f} min restantes)",
                flush=True,
            )

    def um(i):
        if parar.is_set():
            return
        try:
            d = cliente.get(f"/{recurso}/{i}")
            if d:
                cache.grava(d)
        except (TokenExpirado, Bloqueado) as e:
            motivo[0] = e
            parar.set()
        progresso()

    def bloco(lote):
        if parar.is_set():
            return
        try:
            for d in cliente.get(f"/{recurso}", {"ids": ",".join(lote)})[recurso]:
                if d:
                    cache.grava(d)
        except (TokenExpirado, Bloqueado) as e:
            motivo[0] = e
            parar.set()
        for _ in lote:
            progresso()

    try:
        if usar_lote:
            blocos = [faltam[i : i + LOTE] for i in range(0, len(faltam), LOTE)]
            with ThreadPoolExecutor(max_workers=workers) as ex:
                list(ex.map(bloco, blocos))
        else:
            with ThreadPoolExecutor(max_workers=workers) as ex:
                list(ex.map(um, faltam))
    except KeyboardInterrupt:
        parar.set()
        print("\n  interrompido - progresso salvo no cache", flush=True)
    finally:
        cache.fecha()

    if isinstance(motivo[0], Bloqueado):
        h = motivo[0].segundos / 3600
        raise SystemExit(
            f"\n!! O app levou bloqueio de rate limit em '{recurso}'.\n"
            f"   O Spotify pediu {motivo[0].segundos:,}s (~{h:.1f}h) de espera.\n"
            f"   {len(cache.itens):,} itens ficaram salvos no cache.\n\n"
            "   O bloqueio e por app (client_id), nao por usuario: um app novo no\n"
            "   dashboard tem cota limpa. Ao voltar, use --rps 1 --workers 1."
        )
    if isinstance(motivo[0], TokenExpirado):
        print(
            f"\n!! Token expirou durante '{recurso}'. "
            f"{len(cache.itens):,} itens salvos.\n"
            "   Pegue um token novo, reexporte SPOTIFY_TOKEN e rode de novo:\n"
            "   ele retoma exatamente de onde parou.",
            file=sys.stderr,
        )
    return [cache.itens[i] for i in ids if cache.tem(i)]


# ------------------------------------------------------------------ extracao
def linha_faixa(t: dict) -> dict:
    album = t.get("album") or {}
    data = album.get("release_date") or ""
    mercados = t.get("available_markets")
    return {
        "track_id": t["id"],
        "isrc": (t.get("external_ids") or {}).get("isrc"),
        "data_lancamento": data or None,
        "precisao_data": album.get("release_date_precision"),
        # o Spotify as vezes devolve release_date "0000": ano invalido, nao ano zero
        "ano_lancamento": ano if (ano := pd.to_numeric(data[:4], errors="coerce")) and ano >= 1900 else None,
        "album_id": album.get("id"),
        "album_tipo": album.get("album_type"),
        "album_total_faixas": album.get("total_tracks"),
        "numero_faixa": t.get("track_number"),
        "popularidade_api": t.get("popularity"),
        "n_mercados": len(mercados) if mercados else None,
        "artistas_ids": ";".join(a["id"] for a in t.get("artists") or []),
    }


def linha_artista(a: dict) -> dict:
    return {
        "artista_id": a["id"],
        "generos_artista": ";".join(a.get("genres") or []),
        "seguidores_artista": (a.get("followers") or {}).get("total"),
        "popularidade_artista": a.get("popularity"),
    }


# ------------------------------------------------------------------ principal
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, help="processa apenas as N primeiras faixas")
    ap.add_argument("--workers", type=int, default=2, help="threads (padrao 2)")
    ap.add_argument(
        "--rps", type=float, default=3.0,
        help="teto de requests por segundo (padrao 3; suba com cuidado)",
    )
    ap.add_argument("--skip-artistas", action="store_true")
    ap.add_argument("--single", action="store_true", help="forca modo single")
    args = ap.parse_args()

    token = os.environ.get("SPOTIFY_TOKEN")
    cid = os.environ.get("SPOTIFY_CLIENT_ID")
    secret = os.environ.get("SPOTIFY_CLIENT_SECRET")
    if not token and not (cid and secret):
        sys.exit("Defina SPOTIFY_TOKEN, ou SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET.")
    cliente = Cliente(token=token, client_id=cid, client_secret=secret)
    cliente.intervalo = 1.0 / args.rps if args.rps > 0 else 0.0

    ids = pd.read_csv(ENTRADA, usecols=["track_id"])["track_id"].tolist()
    if args.limit:
        ids = ids[: args.limit]

    # sondagem: o app tem acesso aos endpoints em lote?
    status, corpo = cliente.get("/tracks", {"ids": ids[0]}, cru=True)
    if status == 429:
        raise SystemExit(
            "O app esta com rate limit ativo agora (429 ja na sondagem).\n"
            "Espere a janela passar ou use as credenciais de um app novo."
        )
    usar_lote = status == 200 and not args.single
    if usar_lote:
        print(f"Modo LOTE (50/request) - ~{(len(ids) + 49) // 50:,} requests")
    else:
        print(f"Modo SINGLE ({status} no endpoint em lote) - {len(ids):,} requests")
    print(f"Faixas: {len(ids):,} | workers: {args.workers} | teto {args.rps}/s")
    if CA:
        print(f"CA bundle: {CA}")
    print()

    tracks = coletar(cliente, ids, "tracks", args.workers, usar_lote)
    df = pd.DataFrame([linha_faixa(t) for t in tracks])
    if df.empty:
        sys.exit("Nenhuma faixa coletada.")
    print(f"\nFaixas: {len(df):,} | com ISRC: {df.isrc.notna().sum():,}")

    if not args.skip_artistas:
        art_ids = sorted({i for l in df.artistas_ids for i in l.split(";") if i})
        print(f"Artistas unicos: {len(art_ids):,}\n")
        artistas = coletar(cliente, art_ids, "artists", args.workers, usar_lote)
        if artistas:
            art = pd.DataFrame([linha_artista(a) for a in artistas]).set_index(
                "artista_id"
            )
            principal = df.artistas_ids.str.split(";").str[0]
            df = df.join(
                art.reindex(principal).set_index(df.index).add_suffix("_principal")
            )
            mapa = art["generos_artista"].to_dict()
            df["generos_spotify"] = [
                ";".join(
                    dict.fromkeys(  # dedup preservando ordem
                        g
                        for i in l.split(";")
                        for g in (mapa.get(i) or "").split(";")
                        if g
                    )
                )
                for l in df.artistas_ids
            ]

    df["decada_lancamento"] = (df.ano_lancamento // 10 * 10).astype("Int64")

    # o endpoint single omite popularity e available_markets; nao adianta manter
    # coluna que veio 100% vazia
    vazias = [c for c in df.columns if df[c].isna().all()]
    if vazias:
        print(f"Colunas descartadas (sem dado nesta modalidade): {', '.join(vazias)}")
        df = df.drop(columns=vazias)

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(f"{SAIDA}.parquet", index=False)
    df.to_csv(f"{SAIDA}.csv", index=False)
    print(f"\nGravado: {SAIDA}.parquet / .csv  ({df.shape[0]:,} x {df.shape[1]})")
    print(f"Cobertura de ano_lancamento: {df.ano_lancamento.notna().mean():.1%}")


if __name__ == "__main__":
    main()
