"""
export_for_nextjs.py — Converte o posterior treinado (NetCDF) em JSON compacto
para servir no backend Next.js (TypeScript).

Pipeline:
  1. Lê artifacts/k11_posterior.nc (ArviZ InferenceData, 4 chains x 1000 draws).
  2. Empilha chain+draw -> sample (4000 totais) e sub-amostra 1000 com SEED=42.
  3. Escreve:
       - k11_posterior_summary.json (~10 KB) — sumário leve p/ startup.
       - k11_posterior_samples.json.gz (~2-5 MB) — 1000 samples gzipped.
  4. Garante/copia:
       - scaler.json
       - feature_names.json
       - genero_cats.json
     Se existirem em artifacts/, são copiados; caso contrário, são
     regenerados a partir de data/processed/spotify_tracks_limpo.parquet
     usando a mesma lógica de train_k11.py.

Dependências:
  arviz, numpy, pandas, stdlib (json, gzip, shutil).
  NÃO depende de pymc/jax/numpyro.

Uso:
  python scripts/k11_pipeline/export.py

Saídas em artifacts/:
  - k11_posterior_summary.json
  - k11_posterior_samples.json.gz
  - scaler.json              (cópia ou recriado)
  - feature_names.json       (cópia ou recriado)
  - genero_cats.json         (cópia ou recriado)
"""

from __future__ import annotations

import gzip
import json
import shutil
from pathlib import Path

import arviz as az
import numpy as np
import pandas as pd

# =====================================================================
# Configuração
# =====================================================================
SEED = 42
N_SAMPLES = 1000  # samples a reter no JSON compactado

PIPELINE_ROOT = Path(__file__).resolve().parent
ARTIFACTS_DIR = PIPELINE_ROOT / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

DATA_PATH = PIPELINE_ROOT / "spotify_tracks_limpo.parquet"

# Gêneros a remover (espelha train_k11.py).
NON_MUSICAL = ["sleep", "study", "comedy", "kids", "children", "new-age"]

# Features K=11 (espelha train_k11.py).
BASELINE_FEATS = [
    "danceability",
    "energy",
    "loudness",
    "speechiness",
    "acousticness",
    "instrumentalness",
    "liveness",
    "valence",
    "tempo",
    "explicit",
]
K11_FEATS = BASELINE_FEATS + ["mode_bin"]
CONTINUOUS_FEATS = [
    "danceability",
    "energy",
    "loudness",
    "speechiness",
    "acousticness",
    "instrumentalness",
    "liveness",
    "valence",
    "tempo",
]
BINARY_FEATS = ["explicit", "mode_bin"]

# =====================================================================
# Helpers
# =====================================================================
def file_size_kb(path: Path) -> float:
    """Tamanho do arquivo em KB (1 KB = 1024 bytes)."""
    return path.stat().st_size / 1024.0


def ensure_feature_and_cats(out_dir: Path) -> tuple[list[str], list[str]]:
    """Garante que feature_names.json e genero_cats.json existam em out_dir.

    Estratégia:
      1) Se já existem em out_dir, lê e retorna.
      2) Senão, recria a partir do parquet limpo (mesma lógica do train_k11.py).
    """
    feat_path = out_dir / "feature_names.json"
    cats_path = out_dir / "genero_cats.json"

    need_feat = not feat_path.exists()
    need_cats = not cats_path.exists()

    if not (need_feat or need_cats):
        feature_names = json.loads(feat_path.read_text(encoding="utf-8"))
        genero_cats = json.loads(cats_path.read_text(encoding="utf-8"))
        return feature_names, genero_cats

    print(f"[recreate] Lendo {DATA_PATH.relative_to(PIPELINE_ROOT)} ...", flush=True)
    df = pd.read_parquet(DATA_PATH)

    # Aplica filtro não-musical (mesmo do train_k11.py).
    pattern = "|".join(NON_MUSICAL)
    mask_non_musical = (
        df["generos"].fillna("").str.contains(pattern, case=False, regex=True)
    )
    df = df.loc[~mask_non_musical].reset_index(drop=True).copy()

    # Garante tipos.
    df["mode_bin"] = df["mode"].astype(int)
    df["explicit"] = df["explicit"].astype(int)

    # dropna nas colunas necessárias.
    df = df.dropna(subset=K11_FEATS + ["popularity", "genero_principal"]).reset_index(drop=True)

    if need_feat:
        feat_path.write_text(
            json.dumps(K11_FEATS, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"      - {feat_path.relative_to(PIPELINE_ROOT)} (recriado)", flush=True)

    if need_cats:
        genero_cats = sorted(df["genero_principal"].astype(str).unique().tolist())
        cats_path.write_text(
            json.dumps(genero_cats, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"      - {cats_path.relative_to(PIPELINE_ROOT)} (recriado, {len(genero_cats)} generos)", flush=True)

    feature_names = json.loads(feat_path.read_text(encoding="utf-8"))
    genero_cats = json.loads(cats_path.read_text(encoding="utf-8"))
    return feature_names, genero_cats


def ensure_scaler(out_dir: Path) -> dict:
    """Garante scaler.json em out_dir.

    Estratégia:
      1) Se já existe, lê e retorna.
      2) Senão, recria a partir do parquet com a mesma lógica de train_k11.py
         (apenas features contínuas; binárias têm identidade mean=0, std=1).
    """
    scaler_path = out_dir / "scaler.json"
    if scaler_path.exists():
        return json.loads(scaler_path.read_text(encoding="utf-8"))

    print(f"[recreate] Lendo {DATA_PATH.relative_to(PIPELINE_ROOT)} ...", flush=True)
    df = pd.read_parquet(DATA_PATH)

    # Filtro não-musical + tipos (espelha train_k11.py).
    pattern = "|".join(NON_MUSICAL)
    mask_non_musical = (
        df["generos"].fillna("").str.contains(pattern, case=False, regex=True)
    )
    df = df.loc[~mask_non_musical].reset_index(drop=True).copy()
    df["mode_bin"] = df["mode"].astype(int)
    df["explicit"] = df["explicit"].astype(int)
    df = df.dropna(subset=K11_FEATS + ["popularity", "genero_principal"]).reset_index(drop=True)

    scaler: dict[str, dict[str, float]] = {}
    for feat in CONTINUOUS_FEATS:
        mean = float(df[feat].mean())
        std = float(df[feat].std(ddof=0))
        std_safe = std if std > 0 else 1.0
        scaler[feat] = {"mean": mean, "std": std_safe}

    scaler_path.write_text(
        json.dumps(scaler, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"      - {scaler_path.relative_to(PIPELINE_ROOT)} (recriado)", flush=True)
    return scaler


# =====================================================================
# 1) Carregar posterior
# =====================================================================
def load_posterior(pkl_path: Path) -> az.InferenceData:
    """Lê o posterior pickle e valida o shape mínimo esperado (4 chains x 1000 draws).

    Tenta pickle primeiro (formato novo). Fallback para NetCDF se nao achar pickle
    (legacy, requer netCDF4 instalado).
    """
    if not pkl_path.exists():
        legacy_nc = pkl_path.with_suffix(".nc")
        if legacy_nc.exists():
            print(f"[1/4] Lendo {legacy_nc.relative_to(PIPELINE_ROOT)} (legacy NetCDF) ...", flush=True)
            idata = az.from_netcdf(str(legacy_nc))
        else:
            raise FileNotFoundError(
                f"Posterior nao encontrado em {pkl_path} nem {legacy_nc}. "
                "Rode train.py antes (em scripts/k11_pipeline/train.py)."
            )
    else:
        print(f"[1/4] Lendo {pkl_path.relative_to(PIPELINE_ROOT)} ...", flush=True)
        import pickle
        with open(pkl_path, "rb") as f:
            idata = pickle.load(f)

    post = idata.posterior
    if "chain" not in post.dims or "draw" not in post.dims:
        raise ValueError(
            f"Posterior não tem dims (chain, draw). Dims: {dict(post.sizes)}"
        )

    n_chains = int(post.sizes["chain"])
    n_draws = int(post.sizes["draw"])
    print(f"      chains={n_chains} | draws={n_draws} | total={n_chains * n_draws}", flush=True)
    return idata


# =====================================================================
# 2) Sumário leve (means e stds sobre chain+draw)
# =====================================================================
def build_summary(
    idata: az.InferenceData,
    feature_names: list[str],
    genero_cats: list[str],
) -> dict:
    """Calcula mean/std de cada parâmetro ao longo de (chain, draw).

    Para arrays multidimensionais (ex.: beta_g (genero, feature)),
    serializa como lista flatten.
    """
    print("[2/4] Calculando sumário ...", flush=True)
    post = idata.posterior
    summary: dict = {
        "feature_names": list(feature_names),
        "genero_cats": list(genero_cats),
    }

    # Escalares.
    summary["mu_alpha_mean"] = float(post["mu_alpha"].mean().item())
    summary["mu_alpha_std"] = float(post["mu_alpha"].std().item())
    summary["sigma_alpha_mean"] = float(post["sigma_alpha"].mean().item())
    summary["sigma_alpha_std"] = float(post["sigma_alpha"].std().item())
    summary["sigma_y_mean"] = float(post["sigma_y"].mean().item())
    summary["sigma_y_std"] = float(post["sigma_y"].std().item())

    # Vetores (per-feature, length 11).
    summary["mu_beta_mean"] = post["mu_beta"].mean(dim=("chain", "draw")).values.tolist()
    summary["mu_beta_std"] = post["mu_beta"].std(dim=("chain", "draw")).values.tolist()
    summary["sigma_beta_mean"] = post["sigma_beta"].mean(dim=("chain", "draw")).values.tolist()
    summary["sigma_beta_std"] = post["sigma_beta"].std(dim=("chain", "draw")).values.tolist()

    # Determinísticos por gênero.
    summary["alpha_g_mean"] = post["alpha_g"].mean(dim=("chain", "draw")).values.tolist()
    summary["alpha_g_std"] = post["alpha_g"].std(dim=("chain", "draw")).values.tolist()

    # beta_g: dims (genero, feature) -> flatten (genero*feature) preservando ordem.
    summary["beta_g_mean"] = (
        post["beta_g"].mean(dim=("chain", "draw")).values.flatten().tolist()
    )
    summary["beta_g_std"] = (
        post["beta_g"].std(dim=("chain", "draw")).values.flatten().tolist()
    )

    return summary


# =====================================================================
# 3) Samples (concatena chains, sub-amostra N_SAMPLES=1000 com SEED=42)
# =====================================================================
def build_samples(idata: az.InferenceData) -> dict:
    """Empilha chain+draw, sorteia 1000 índices sem reposição, serializa."""
    print("[3/4] Empilhando chains e sub-amostrando 1000 samples ...", flush=True)
    post = idata.posterior.to_dataset()
    stacked = post.stack(sample=("chain", "draw"))  # dims: sample, ...

    n_total = int(stacked.sizes["sample"])
    rng = np.random.default_rng(SEED)
    idx = rng.choice(n_total, size=N_SAMPLES, replace=False)
    idx.sort()  # opcional: ordem determinística e amigável para diffs
    print(f"      total={n_total} -> selecionados={N_SAMPLES}", flush=True)

    def _to_list(var_name: str) -> list:
        """Seleciona idx na dim 'sample' e converte para lista Python.

        IMPORTANTE: xarray.stack() coloca a nova dim 'sample' no final dos
        eixos (ex.: (feature, sample) em vez de (sample, feature)). Para
        casar com o shape esperado pelo backend Next.js — sempre
        (sample, ...) — usamos transpose() para trazer 'sample' para a
        primeira posição.
        """
        da = stacked[var_name].isel(sample=idx)
        # Reordena: 'sample' primeiro, demais dims na ordem original.
        other_dims = [d for d in da.dims if d != "sample"]
        da = da.transpose("sample", *other_dims)
        return da.values.tolist()

    samples = {
        "mu_alpha": _to_list("mu_alpha"),
        "sigma_alpha": _to_list("sigma_alpha"),
        "mu_beta": _to_list("mu_beta"),
        "sigma_beta": _to_list("sigma_beta"),
        "alpha_g": _to_list("alpha_g"),
        "beta_g": _to_list("beta_g"),
        "sigma_y": _to_list("sigma_y"),
    }
    return samples


# =====================================================================
# 4) Escrita
# =====================================================================
def write_outputs(
    summary: dict,
    samples: dict,
    out_dir: Path,
) -> tuple[Path, Path]:
    """Escreve summary JSON e samples JSON gzipped. Retorna os Paths."""
    summary_path = out_dir / "k11_posterior_summary.json"
    samples_path = out_dir / "k11_posterior_samples.json.gz"

    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"      - {summary_path.relative_to(PIPELINE_ROOT)}", flush=True)

    # Samples: gzipped JSON. Compressão default (nível 6) é o sweet spot.
    with gzip.open(samples_path, "wt", encoding="utf-8") as f:
        json.dump(samples, f, ensure_ascii=False)
    print(f"      - {samples_path.relative_to(PIPELINE_ROOT)}", flush=True)

    return summary_path, samples_path


# =====================================================================
# main
# =====================================================================
def main() -> None:
    print("=" * 70, flush=True)
    print("export_for_nextjs — Posterior -> JSON para Next.js", flush=True)
    print(f"SEED={SEED} | N_SAMPLES={N_SAMPLES} | artifacts={ARTIFACTS_DIR}", flush=True)
    print("=" * 70, flush=True)

    nc_path = ARTIFACTS_DIR / "k11_posterior.pkl"
    idata = load_posterior(nc_path)

    # Side artifacts.
    feature_names, genero_cats = ensure_feature_and_cats(ARTIFACTS_DIR)
    ensure_scaler(ARTIFACTS_DIR)
    print(
        f"      feature_names={len(feature_names)} | genero_cats={len(genero_cats)}",
        flush=True,
    )

    # Summary + samples.
    summary = build_summary(idata, feature_names, genero_cats)
    samples = build_samples(idata)

    # Escrita.
    print("[4/4] Escrevendo artefatos ...", flush=True)
    summary_path, samples_path = write_outputs(summary, samples, ARTIFACTS_DIR)

    # Relatório final com tamanhos.
    scaler_path = ARTIFACTS_DIR / "scaler.json"
    feat_path = ARTIFACTS_DIR / "feature_names.json"
    cats_path = ARTIFACTS_DIR / "genero_cats.json"

    print("", flush=True)
    print("=" * 70, flush=True)
    print("ARTEFATOS GERADOS", flush=True)
    print(f"  {summary_path.name:38s}  {file_size_kb(summary_path):8.2f} KB", flush=True)
    print(f"  {samples_path.name:38s}  {file_size_kb(samples_path):8.2f} KB", flush=True)
    print(f"  {scaler_path.name:38s}  {file_size_kb(scaler_path):8.2f} KB", flush=True)
    print(f"  {feat_path.name:38s}  {file_size_kb(feat_path):8.2f} KB", flush=True)
    print(f"  {cats_path.name:38s}  {file_size_kb(cats_path):8.2f} KB", flush=True)
    print("=" * 70, flush=True)


if __name__ == "__main__":
    main()
