"""Junta o enriquecimento ao dataset limpo e atualiza o dicionario de dados.

Fontes:
  - MusicBrainz (89.740 faixas cruzadas por nome): data de lancamento ORIGINAL
  - Spotify (599 faixas coletadas antes do bloqueio de cota): ISRC e data da EDICAO

A data principal vem do MusicBrainz de proposito. O Spotify devolve a data da
edicao no catalogo dele - um remaster de 1969 aparece como 2009 -, enquanto o
`first_release_date` do MusicBrainz e o lancamento original da obra, que e o que
serve para analise por decada.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
PROC = RAIZ / "data" / "processed"
LIMPO = PROC / "spotify_tracks_limpo"
MB = PROC / "enriquecimento_musicbrainz.parquet"
SPOTIFY_JSONL = RAIZ / "data" / "raw_api" / "tracks.jsonl"
SAIDA = PROC / "spotify_tracks_enriquecido"

NOVAS = {
    "ano_lancamento": "Ano de lancamento original da obra (MusicBrainz)",
    "decada_lancamento": "Decada de lancamento (derivada de ano_lancamento)",
    "data_lancamento": "Data original completa AAAA-MM-DD quando o MusicBrainz tem dia e mes",
    "confianca_lancamento": "Confianca do cruzamento por nome: alta, media ou baixa",
    "estrategia_match": "Chave que casou: artista+titulo, creditos+titulo ou artista+titulo_base",
    "n_gravacoes_mb": "Gravacoes distintas do MusicBrainz sob a mesma chave (1 = inequivoco)",
    "isrc": "ISRC da gravacao (so nas 599 faixas coletadas do Spotify)",
    "ano_lancamento_spotify": "Ano da EDICAO segundo o Spotify, para conferencia (599 faixas)",
}


def main() -> None:
    faixas = pd.read_parquet(f"{LIMPO}.parquet")
    mb = pd.read_parquet(MB)
    print(f"dataset limpo : {faixas.shape}")
    print(f"MusicBrainz   : {mb.ano_lancamento_mb.notna().sum():,} faixas com data")

    df = faixas.merge(mb, on="track_id", how="left", validate="one_to_one")
    assert len(df) == len(faixas), "merge duplicou linhas"

    # Confianca: combina o quao estrita foi a chave com o quanto ela e ambigua.
    # Chave que casa com dezenas de gravacoes distintas costuma ser titulo
    # generico ("Intro") ou coletanea, entao vale menos.
    estrita = df.estrategia_match.isin(["artista+titulo", "creditos+titulo"])
    df["confianca_lancamento"] = pd.NA
    casou = df.ano_lancamento_mb.notna()
    df.loc[casou, "confianca_lancamento"] = "baixa"
    df.loc[casou & (df.n_gravacoes_mb <= 20), "confianca_lancamento"] = "media"
    df.loc[casou & estrita & (df.n_gravacoes_mb <= 5), "confianca_lancamento"] = "alta"

    df = df.rename(columns={
        "ano_lancamento_mb": "ano_lancamento",
        "decada_lancamento_mb": "decada_lancamento",
    })
    # data completa so quando o MusicBrainz tem mes e dia
    completa = df.ano_lancamento.notna() & df.mes_lancamento_mb.notna() & df.dia_lancamento_mb.notna()
    df["data_lancamento"] = pd.NA
    df.loc[completa, "data_lancamento"] = (
        df.loc[completa, "ano_lancamento"].astype(int).astype(str).str.zfill(4) + "-"
        + df.loc[completa, "mes_lancamento_mb"].astype(int).astype(str).str.zfill(2) + "-"
        + df.loc[completa, "dia_lancamento_mb"].astype(int).astype(str).str.zfill(2)
    )
    df = df.drop(columns=["mes_lancamento_mb", "dia_lancamento_mb"])

    # ISRC e data da edicao das 599 que deu tempo de coletar do Spotify
    if SPOTIFY_JSONL.exists():
        linhas = [json.loads(l) for l in SPOTIFY_JSONL.read_text().splitlines() if l.strip()]
        sp = pd.DataFrame([{
            "track_id": t["id"],
            "isrc": (t.get("external_ids") or {}).get("isrc"),
            "ano_lancamento_spotify": pd.to_numeric(
                ((t.get("album") or {}).get("release_date") or "")[:4], errors="coerce"),
        } for t in linhas])
        sp = sp[sp.ano_lancamento_spotify.between(1900, 2100) | sp.isrc.notna()]
        df = df.merge(sp, on="track_id", how="left", validate="one_to_one")
        print(f"Spotify       : {len(sp):,} faixas com ISRC/data de conferencia")
    else:
        df["isrc"] = pd.NA
        df["ano_lancamento_spotify"] = pd.NA

    for c in ("ano_lancamento", "decada_lancamento", "n_gravacoes_mb",
              "ano_lancamento_spotify"):
        df[c] = df[c].astype("Int64")

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(f"{SAIDA}.parquet", index=False)
    df.to_csv(f"{SAIDA}.csv", index=False)

    # dicionario: mantem as descricoes existentes e acrescenta as colunas novas
    dic = pd.read_csv(PROC / "dicionario_dados.csv")
    novas = pd.DataFrame([
        {"coluna": c, "tipo": str(df[c].dtype), "nulos": int(df[c].isna().sum()),
         "descricao": d}
        for c, d in NOVAS.items() if c in df.columns
    ])
    pd.concat([dic[~dic.coluna.isin(NOVAS)], novas], ignore_index=True).to_csv(
        PROC / "dicionario_dados.csv", index=False)

    print(f"\ngravado {SAIDA}.parquet / .csv  ({df.shape[0]:,} x {df.shape[1]})")
    print(f"cobertura de ano_lancamento: {df.ano_lancamento.notna().mean():.1%}")
    print("\nconfianca:")
    print(df.confianca_lancamento.value_counts(dropna=False).to_string())


if __name__ == "__main__":
    main()
