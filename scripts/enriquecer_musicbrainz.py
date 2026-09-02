"""Enriquece o dataset do Spotify com data de lancamento vinda do MusicBrainz.

A API do Spotify ficou inviavel: os endpoints em lote (`?ids=`) sao 403 para apps
em Development mode, e o modo single esbarra numa cota de ~600 requests, o que
daria ~200 dias para as 89.740 faixas. O MusicBrainz nao tem cota: baixa-se o
dump e cruza-se localmente.

Como o dataset nao tem ISRC, o cruzamento e por (artista, titulo) normalizados.
Isso e aproximado, entao o script mede a propria qualidade: as 599 faixas que
chegamos a coletar do Spotify servem de gabarito para a taxa de acerto.

A data usada e `release_group_meta.first_release_date`, ou seja, o lancamento
ORIGINAL da obra - nao a data da edicao/remaster, que e o que o Spotify devolve.

Estagios (cada um pula se ja tiver rodado):
    --extrair    tira as 6 tabelas necessarias do mbdump.tar.bz2
    --construir  monta o indice (artista, titulo) -> data no duckdb
    --casar      cruza com as faixas do Spotify e grava o resultado

Uso:
    .venv/bin/python scripts/enriquecer_musicbrainz.py
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

import duckdb

RAIZ = Path(__file__).resolve().parent.parent
MB = RAIZ / "data" / "musicbrainz"
DUMP = MB / "mbdump.tar.bz2"
DUMP_DERIVED = MB / "mbdump-derived.tar.bz2"
# as tabelas *_meta sao derivadas e vem num arquivo separado
DERIVADAS = {"release_group_meta"}
TABELAS_DIR = MB / "mbdump"
BANCO = MB / "mb.duckdb"
FAIXAS = RAIZ / "data" / "processed" / "spotify_tracks_limpo.csv"
GABARITO = RAIZ / "data" / "raw_api" / "tracks.jsonl"
SAIDA = RAIZ / "data" / "processed" / "enriquecimento_musicbrainz"

# ordem exata das colunas no dump, extraida de admin/sql/CreateTables.sql
COLUNAS = {
    "artist_credit": ["id", "name", "artist_count", "ref_count", "created",
                      "edits_pending", "gid"],
    "recording": ["id", "gid", "name", "artist_credit", "length", "comment",
                  "edits_pending", "last_updated", "video"],
    "track": ["id", "gid", "recording", "medium", "position", "number", "name",
              "artist_credit", "length", "edits_pending", "last_updated",
              "is_data_track"],
    "medium": ["id", "release", "position", "format", "name", "edits_pending",
               "last_updated", "track_count", "gid"],
    "release": ["id", "gid", "name", "artist_credit", "release_group", "status",
                "packaging", "language", "script", "barcode", "comment",
                "edits_pending", "quality", "last_updated"],
    "release_group_meta": ["id", "release_count", "first_release_date_year",
                           "first_release_date_month", "first_release_date_day",
                           "rating", "rating_count"],
}

# colunas que precisamos de fato tipar; o resto entra como VARCHAR e e ignorado
INTEIRAS = {
    "artist_credit": {"id"},
    "recording": {"id", "artist_credit"},
    "track": {"id", "recording", "medium"},
    "medium": {"id", "release"},
    "release": {"id", "release_group"},
    "release_group_meta": {"id", "first_release_date_year",
                           "first_release_date_month", "first_release_date_day"},
}

# Normalizacao unica, aplicada dos DOIS lados do cruzamento. Fica em SQL de
# proposito: rodar a mesma expressao nos 40M do MusicBrainz e nas 89k do Spotify
# garante que nao ha divergencia entre uma versao Python e uma versao SQL.
def norma(expr: str) -> str:
    return f"regexp_replace(lower(strip_accents({expr})), '[^a-z0-9]', '', 'g')"


def titulo_base(expr: str) -> str:
    """Remove sufixos de versao que o Spotify cola no titulo e o MB nao tem.

    'Bohemian Rhapsody - Remastered 2011'      -> 'Bohemian Rhapsody'
    'Comedy (Glee Cast Version)'               -> 'Comedy'
    """
    sem_traco = f"regexp_replace({expr}, ' - [^-]*$', '')"
    return f"regexp_replace({sem_traco}, '\\s*[\\(\\[][^\\)\\]]*[\\)\\]]\\s*$', '')"


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ------------------------------------------------------------------ extracao
def extrair() -> None:
    if all((TABELAS_DIR / t).exists() for t in COLUNAS):
        log("tabelas ja extraidas, pulando")
        return
    for arquivo, tabelas in (
        (DUMP, [t for t in COLUNAS if t not in DERIVADAS]),
        (DUMP_DERIVED, [t for t in COLUNAS if t in DERIVADAS]),
    ):
        pendentes = [t for t in tabelas if not (TABELAS_DIR / t).exists()]
        if not pendentes:
            continue
        if not arquivo.exists():
            sys.exit(f"Dump nao encontrado: {arquivo}")
        log(f"extraindo {len(pendentes)} tabelas de {arquivo.name} "
            f"({arquivo.stat().st_size/1e9:.1f} GB)")
        r = subprocess.run(
            ["tar", "-xjf", str(arquivo), "-C", str(MB),
             *(f"mbdump/{t}" for t in pendentes)],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            sys.exit(f"tar falhou em {arquivo.name}: {r.stderr[:500]}")
    for t in COLUNAS:
        p = TABELAS_DIR / t
        log(f"  {t:22s} {p.stat().st_size/1e9:6.2f} GB")


# ------------------------------------------------------------------ carga
def leitor(tabela: str) -> str:
    """SQL read_csv para um dump COPY do Postgres (TSV, \\N = NULL, sem aspas)."""
    cols = ", ".join(
        f"'{c}': '{'BIGINT' if c in INTEIRAS.get(tabela, set()) else 'VARCHAR'}'"
        for c in COLUNAS[tabela]
    )
    return (
        f"read_csv('{TABELAS_DIR / tabela}', delim='\\t', header=false, "
        f"quote='', escape='', nullstr='\\N', columns={{{cols}}}, "
        f"ignore_errors=true)"
    )


def construir(con: duckdb.DuckDBPyConnection) -> None:
    if con.execute(
        "SELECT count(*) FROM duckdb_tables() WHERE table_name='mb_indice'"
    ).fetchone()[0]:
        log("indice ja construido, pulando")
        return

    for t in COLUNAS:
        log(f"carregando {t}")
        con.execute(f"CREATE OR REPLACE TABLE {t} AS SELECT * FROM {leitor(t)}")
        n = con.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
        log(f"  {t:22s} {n:>12,} linhas")

    # data original da obra por gravacao: recording -> track -> medium ->
    # release -> release_group_meta. Uma gravacao aparece em varios releases;
    # a primeira data entre eles e o lancamento original.
    log("montando data original por gravacao")
    con.execute("""
        CREATE OR REPLACE TABLE rec_data AS
        SELECT
            t.recording                              AS recording_id,
            min(rgm.first_release_date_year)         AS ano,
            arg_min(rgm.first_release_date_month, rgm.first_release_date_year) AS mes,
            arg_min(rgm.first_release_date_day,   rgm.first_release_date_year) AS dia
        FROM track t
        JOIN medium m            ON m.id   = t.medium
        JOIN release rel         ON rel.id = m.release
        JOIN release_group_meta rgm ON rgm.id = rel.release_group
        WHERE rgm.first_release_date_year IS NOT NULL
          AND rgm.first_release_date_year BETWEEN 1900 AND 2100
        GROUP BY 1
    """)
    log(f"  gravacoes com data: {con.execute('SELECT count(*) FROM rec_data').fetchone()[0]:,}")

    # indice final: (artista, titulo) normalizados -> data mais antiga.
    # n_gravacoes registra ambiguidade: chave que casa com muitas gravacoes
    # distintas e menos confiavel.
    log("montando indice (artista, titulo) -> data")
    con.execute(f"""
        CREATE OR REPLACE TABLE mb_indice AS
        SELECT
            {norma('ac.name')}          AS artista_norm,
            {norma('r.name')}           AS titulo_norm,
            min(d.ano)                  AS ano,
            arg_min(d.mes, d.ano)       AS mes,
            arg_min(d.dia, d.ano)       AS dia,
            count(DISTINCT r.id)        AS n_gravacoes
        FROM recording r
        JOIN artist_credit ac ON ac.id = r.artist_credit
        JOIN rec_data d       ON d.recording_id = r.id
        WHERE length({norma('ac.name')}) > 0 AND length({norma('r.name')}) > 0
        GROUP BY 1, 2
    """)
    n = con.execute("SELECT count(*) FROM mb_indice").fetchone()[0]
    log(f"  chaves no indice: {n:,}")
    con.execute("CREATE INDEX idx_mb ON mb_indice (artista_norm, titulo_norm)")


# ------------------------------------------------------------------ match
def casar(con: duckdb.DuckDBPyConnection) -> None:
    log("carregando faixas do Spotify")
    con.execute(f"""
        CREATE OR REPLACE TABLE spotify AS
        SELECT track_id, track_name, artists, artista_principal
        FROM read_csv('{FAIXAS}', header=true, AUTO_DETECT=true)
    """)

    # Tres chaves, da mais estrita para a mais frouxa. A ordem importa: a
    # primeira que casar vence, para nao trocar um acerto exato por um
    # aproximado.
    con.execute(f"""
        CREATE OR REPLACE TABLE spotify_chaves AS
        SELECT
            track_id,
            track_name,
            artista_principal,
            {norma('artista_principal')}                      AS a_princ,
            {norma("replace(artists, ';', ' ')")}             AS a_todos,
            {norma('track_name')}                             AS t_cheio,
            {norma(titulo_base('track_name'))}                AS t_base
        FROM spotify
    """)

    log("cruzando (3 estrategias, da mais estrita para a mais frouxa)")
    con.execute("""
        CREATE OR REPLACE TABLE casamento AS
        WITH e1 AS (
            SELECT s.track_id, i.ano, i.mes, i.dia, i.n_gravacoes,
                   'artista+titulo' AS estrategia
            FROM spotify_chaves s
            JOIN mb_indice i ON i.artista_norm = s.a_princ AND i.titulo_norm = s.t_cheio
        ),
        e2 AS (
            SELECT s.track_id, i.ano, i.mes, i.dia, i.n_gravacoes,
                   'creditos+titulo' AS estrategia
            FROM spotify_chaves s
            JOIN mb_indice i ON i.artista_norm = s.a_todos AND i.titulo_norm = s.t_cheio
            WHERE s.track_id NOT IN (SELECT track_id FROM e1)
        ),
        e3 AS (
            SELECT s.track_id, i.ano, i.mes, i.dia, i.n_gravacoes,
                   'artista+titulo_base' AS estrategia
            FROM spotify_chaves s
            JOIN mb_indice i ON i.artista_norm = s.a_princ AND i.titulo_norm = s.t_base
            WHERE s.track_id NOT IN (SELECT track_id FROM e1)
              AND s.track_id NOT IN (SELECT track_id FROM e2)
        )
        SELECT * FROM e1 UNION ALL SELECT * FROM e2 UNION ALL SELECT * FROM e3
    """)

    con.execute("""
        CREATE OR REPLACE TABLE resultado AS
        SELECT
            s.track_id,
            c.ano                     AS ano_lancamento_mb,
            c.mes                     AS mes_lancamento_mb,
            c.dia                     AS dia_lancamento_mb,
            (c.ano // 10) * 10        AS decada_lancamento_mb,
            c.estrategia              AS estrategia_match,
            c.n_gravacoes             AS n_gravacoes_mb
        FROM spotify_chaves s
        LEFT JOIN casamento c USING (track_id)
    """)

    total, casados = con.execute(
        "SELECT count(*), count(ano_lancamento_mb) FROM resultado"
    ).fetchone()
    log(f"cobertura: {casados:,}/{total:,} ({casados/total:.1%})")
    print("\nPor estrategia:")
    print(con.execute("""
        SELECT coalesce(estrategia_match,'(sem match)') AS estrategia,
               count(*) AS faixas,
               round(100.0*count(*)/sum(count(*)) OVER (), 1) AS pct
        FROM resultado GROUP BY 1 ORDER BY faixas DESC
    """).df().to_string(index=False))

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    df = con.execute("SELECT * FROM resultado").df()
    df.to_parquet(f"{SAIDA}.parquet", index=False)
    df.to_csv(f"{SAIDA}.csv", index=False)
    log(f"gravado {SAIDA}.parquet / .csv ({df.shape[0]:,} x {df.shape[1]})")


# ------------------------------------------------------------------ validacao
def validar(con: duckdb.DuckDBPyConnection) -> None:
    """Mede a qualidade do match contra as faixas confirmadas pelo Spotify."""
    if not GABARITO.exists():
        log("sem gabarito do Spotify, pulando validacao")
        return
    log("validando contra as faixas confirmadas pelo Spotify")
    con.execute(f"""
        CREATE OR REPLACE TABLE gabarito AS
        SELECT id AS track_id,
               try_cast(album.release_date[1:4] AS INTEGER) AS ano_spotify
        FROM read_json('{GABARITO}', format='newline_delimited')
        WHERE try_cast(album.release_date[1:4] AS INTEGER) BETWEEN 1900 AND 2100
    """)
    d = con.execute("""
        SELECT g.ano_spotify, r.ano_lancamento_mb AS ano_mb, r.estrategia_match
        FROM gabarito g JOIN resultado r USING (track_id)
    """).df()
    if d.empty:
        log("  gabarito sem sobreposicao"); return

    casou = d.ano_mb.notna()
    print(f"\n  faixas no gabarito     : {len(d):,}")
    print(f"  casadas pelo MusicBrainz: {casou.sum():,} ({casou.mean():.1%})")
    sub = d[casou].copy()
    if sub.empty:
        return
    sub["dif"] = (sub.ano_mb - sub.ano_spotify).abs()
    print(f"\n  Diferenca de ano MB vs Spotify (Spotify traz a data da EDICAO,")
    print(f"  MB traz a ORIGINAL, entao diferenca nao e necessariamente erro):")
    for rot, cond in [
        ("mesmo ano          ", sub.dif == 0),
        ("ate 1 ano          ", sub.dif <= 1),
        ("ate 5 anos         ", sub.dif <= 5),
        ("MB anterior (>5a)  ", (sub.ano_mb < sub.ano_spotify - 5)),
        ("MB posterior (>5a) ", (sub.ano_mb > sub.ano_spotify + 5)),
    ]:
        print(f"    {rot}: {cond.sum():4,} ({cond.mean():5.1%})")
    print("\n  Por estrategia (mediana da diferenca absoluta):")
    print(sub.groupby("estrategia_match")["dif"].agg(["count", "median"]).to_string())


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--extrair", action="store_true")
    ap.add_argument("--construir", action="store_true")
    ap.add_argument("--casar", action="store_true")
    ap.add_argument("--memoria", default="6GB")
    args = ap.parse_args()
    tudo = not (args.extrair or args.construir or args.casar)

    if tudo or args.extrair:
        extrair()

    MB.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(BANCO))
    con.execute(f"SET memory_limit='{args.memoria}'")
    con.execute(f"SET temp_directory='{MB / 'tmp'}'")
    con.execute("SET preserve_insertion_order=false")

    if tudo or args.construir:
        construir(con)
    if tudo or args.casar:
        casar(con)
        validar(con)
    con.close()


if __name__ == "__main__":
    main()
