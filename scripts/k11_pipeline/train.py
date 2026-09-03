"""
train_k11.py — Treino do modelo Bayesiano hierárquico K=11 (Q8/Q9).

Pipeline:
  1. Configura NumPyro em GPU (T4) com JAX.
  2. Carrega parquet limpo, filtra gêneros não-musicais.
  3. Constrói features K=11 (10 contínuas/binárias + mode_bin).
  4. Z-score nas contínuas, log1p em popularity.
  5. Split 70/15/15 estratificado (?) via shuffle determinístico.
  6. Modelo hierárquico PyMC: intercepts + slopes por gênero com priors NCP.
  7. Fit via NUTS (NumPyro backend) com 4 chains.
  8. Valida r_hat < 1.01, ESS > 400, divergências == 0.
  9. Persiste idata, scaler, feature_names e genero_cats em artifacts/.

Dependências (pinadas em requirements.txt):
  pymc==6.3.1, arviz==1.3.0, pytensor==3.3.0, numpyro, jax[cuda12],
  pandas, numpy, scipy.

Uso:
  python scripts/k11_pipeline/train.py

Saídas em artifacts/:
  - k11_posterior.nc
  - scaler.json
  - feature_names.json
  - genero_cats.json
  - split_indices.npz
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

# --- 0) Configuracao de CPU via env vars (ANTES de qualquer import jax/numpyro) ---
# Variaveis reconhecidas (todas opcionais):
#   K11_HOST_DEVICES : numero de chains em paralelo (default: max = os.cpu_count())
#                      No CPU, isso simula N devices no JAX. Cada chain roda em
#                      1 OMP thread por padrao, mas pode usar mais com K11_OMP_THREADS.
#                      Exemplo: K11_HOST_DEVICES=8 -> 8 chains em paralelo no Ryzen 7.
#   K11_OMP_THREADS  : OpenMP threads por chain (default: 1 = sem paralelismo intra-chain)
#                      Exemplo: K11_OMP_THREADS=2 com K11_HOST_DEVICES=8 = 16 threads total.
#   K11_PLATFORM     : 'cpu' (forca CPU) ou 'cuda' (forca GPU NVIDIA). Default: auto.
#
# Combinacoes comuns para CPU:
#   Max throughput (8 chains, 1 thread cada):  K11_HOST_DEVICES=8  K11_OMP_THREADS=1
#   Max threads  (4 chains, 2 threads cada):   K11_HOST_DEVICES=4  K11_OMP_THREADS=2
#   Conservador (6 chains, 1 thread, 2 livres): K11_HOST_DEVICES=6 K11_OMP_THREADS=1
_HOST_DEVICES = int(os.environ.get("K11_HOST_DEVICES", "0"))  # 0 = max
_OMP_THREADS = int(os.environ.get("K11_OMP_THREADS", "0"))  # 0 = nao setar
if _OMP_THREADS > 0:
    os.environ["OMP_NUM_THREADS"] = str(_OMP_THREADS)
    os.environ["MKL_NUM_THREADS"] = str(_OMP_THREADS)

# --- 1) Backend NumPyro em GPU (T4). Deve vir ANTES de import pymc. -----
import numpyro  # noqa: E402
_platform_env = os.environ.get("K11_PLATFORM", "").strip().lower()
if _platform_env == "cpu":
    numpyro.set_platform("cpu")
else:
    # Auto-detect: cuda se disponivel, senao cpu
    try:
        numpyro.set_platform("cuda")
    except Exception:
        numpyro.set_platform("cpu")

# Habilita N chains em paralelo no CPU (T4 tem so 1 device, sequencial).
try:
    import jax
    if jax.default_backend() == "cpu":
        # Maximo: usa os.cpu_count() chains (cada uma 1 OMP thread)
        n_devices = _HOST_DEVICES if _HOST_DEVICES > 0 else (os.cpu_count() or 4)
        numpyro.set_host_device_count(n_devices)
        n_threads = _OMP_THREADS if _OMP_THREADS > 0 else 1
        print(
            f"[config] CPU mode: {n_devices} chains paralelas x {n_threads} threads/chain "
            f"= {n_devices * n_threads} threads total "
            f"(os.cpu_count() reporta {os.cpu_count()} logical cores)",
            flush=True,
        )
except Exception:
    pass

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import pymc as pm  # noqa: E402
import pytensor.tensor as pt  # noqa: E402
import arviz as az  # noqa: E402


# =====================================================================
# Configuração global
# =====================================================================
SEED = 42
np.random.seed(SEED)

# Caminhos absolutos relativos ao PIPELINE_ROOT (este arquivo: scripts/k11_pipeline/train.py)
PIPELINE_ROOT = Path(__file__).resolve().parent
DATA_PATH = PIPELINE_ROOT / "spotify_tracks_limpo.parquet"
ARTIFACTS_DIR = PIPELINE_ROOT / "artifacts"
# Cria artifacts/ no import (cascata: se isso falhar, nada mais roda).
# Tambem e recriado dentro de main() para garantir caso o diretorio seja
# apagado entre import e execucao.
try:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
except Exception as _e:
    # Nao levanta -- deixa main() reportar com contexto completo.
    print(f"[WARN] Nao foi possivel criar {ARTIFACTS_DIR} no import: {_e}", flush=True)

# Gêneros a remover (não-musicais). Match por substring case-insensitive
# em `generos` (string com todos os gêneros da faixa).
NON_MUSICAL = ["sleep", "study", "comedy", "kids", "children", "new-age"]

# Features: 10 baseline (contínuas + binária `explicit`) + `mode_bin`.
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

# Features contínuas recebem z-score; categóricas/binárias ficam int.
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
BINARY_FEATS = ["explicit", "mode_bin"]  # não normalizadas

# Split ratios (treino / validação / teste).
TRAIN_RATIO, VAL_RATIO, TEST_RATIO = 0.70, 0.15, 0.15


# =====================================================================
# 2) Carregamento e filtragem
# =====================================================================
def load_and_filter(path: Path) -> pd.DataFrame:
    """Carrega o parquet limpo e remove gêneros não-musicais.

    O filtro aplica-se em `generos` (string concatenada) — mais
    conservador que em `genero_principal`, captura casos onde o gênero
    principal é musical mas há tags não-musicais associadas.
    """
    print(f"[1/8] Lendo {path.relative_to(PIPELINE_ROOT)} ...", flush=True)
    df = pd.read_parquet(path)

    pattern = "|".join(NON_MUSICAL)
    mask_non_musical = (
        df["generos"].fillna("").str.contains(pattern, case=False, regex=True)
    )
    n_removed = int(mask_non_musical.sum())
    df = df.loc[~mask_non_musical].reset_index(drop=True).copy()
    print(
        f"      Removidos {n_removed} faixas não-musicais. "
        f"Restantes: {len(df):,}",
        flush=True,
    )
    return df


# =====================================================================
# 3) Construção de K=11 e limpeza
# =====================================================================
def build_k11(df: pd.DataFrame) -> pd.DataFrame:
    """Garante tipos corretos (mode_bin, explicit como int) e dropna."""
    print("[2/8] Construindo K=11 e dropna ...", flush=True)
    df = df.copy()
    df["mode_bin"] = df["mode"].astype(int)
    df["explicit"] = df["explicit"].astype(int)
    cols_needed = K11_FEATS + ["popularity", "genero_principal"]
    before = len(df)
    df = df.dropna(subset=cols_needed).reset_index(drop=True)
    print(
        f"      dropna: {before - len(df)} removidos. Restantes: {len(df):,}",
        flush=True,
    )
    return df


# =====================================================================
# 4) Z-score nas contínuas + log1p no target
# =====================================================================
def _save_side_artifacts(scaler: dict, genero_cats: list[str], out_dir: Path) -> None:
    """Salva scaler.json, feature_names.json, genero_cats.json em out_dir.

    Funcao separada para garantir checkpoint: chamada IMEDIATAMENTE apos o
    preprocessing, ANTES do NUTS. Se o fit falhar, esses artefatos ficam
    disponiveis para diagnostico (e para o evaluate.py rodar).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    # scaler: apenas features continuas (binarias sao identidade).
    scaler_continuous = {f: scaler[f] for f in CONTINUOUS_FEATS}
    with (out_dir / "scaler.json").open("w", encoding="utf-8") as f:
        json.dump(scaler_continuous, f, indent=2, ensure_ascii=False)
    with (out_dir / "feature_names.json").open("w", encoding="utf-8") as f:
        json.dump(K11_FEATS, f, indent=2, ensure_ascii=False)
    with (out_dir / "genero_cats.json").open("w", encoding="utf-8") as f:
        json.dump(genero_cats, f, indent=2, ensure_ascii=False)
    print(f"      [checkpoint] scaler/feature_names/genero_cats salvos em {out_dir}", flush=True)


def make_scaler_and_arrays(
    df: pd.DataFrame,
):
    """Padroniza contínuas, mantém binárias como int, log1p no target.

    NAO faz I/O. Retorna apenas dados; o salvamento dos artefatos em disco
    e responsabilidade de main() (com o out_dir correto).

    Retorna:
      X (np.float32, shape N x 11) já padronizada,
      y_log (np.float32, shape N) = log(popularity + 1),
      scaler (dict) com {feat: {mean, std}} apenas das contínuas,
      genero_cats (list[str]) ordenada alfabeticamente.
    """
    print("[3/8] Z-score + log1p(target) ...", flush=True)

    scaler: dict[str, dict[str, float]] = {}
    X_cols: dict[str, np.ndarray] = {}

    for feat in CONTINUOUS_FEATS:
        mean = float(df[feat].mean())
        std = float(df[feat].std(ddof=0))
        # Guarda contra std=0 (improvável mas defensivo).
        std_safe = std if std > 0 else 1.0
        scaler[feat] = {"mean": mean, "std": std_safe}
        X_cols[feat] = ((df[feat].to_numpy() - mean) / std_safe).astype(np.float32)

    for feat in BINARY_FEATS:
        # Binárias: sem normalização; apenas garante float32.
        X_cols[feat] = df[feat].to_numpy().astype(np.float32)
        scaler[feat] = {"mean": 0.0, "std": 1.0}  # identidade

    # Empilha na ordem canônica K11_FEATS.
    X = np.stack([X_cols[f] for f in K11_FEATS], axis=1).astype(np.float32)

    y_log = np.log(df["popularity"].to_numpy() + 1).astype(np.float32)

    # Categorias ordenadas alfabeticamente para coords estáveis.
    genero_cats = sorted(df["genero_principal"].astype(str).unique().tolist())
    print(f"      X.shape={X.shape}, y_log.shape={y_log.shape}", flush=True)
    print(f"      #generos: {len(genero_cats)}", flush=True)
    return X, y_log, scaler, genero_cats


# =====================================================================
# 5) Split 70/15/15 com shuffle determinístico
# =====================================================================
def split_indices(n: int, out_path: Path):
    """Permutação com np.random.default_rng(SEED=42) e slicing 70/15/15.

    Salva `train_idx`, `val_idx`, `test_idx` em split_indices.npz.
    Faz asserts de não-sobreposição.
    """
    print("[4/8] Split 70/15/15 ...", flush=True)
    idx = np.arange(n)
    rng = np.random.default_rng(SEED)
    rng.shuffle(idx)

    n_train = int(TRAIN_RATIO * n)
    n_val = int(VAL_RATIO * n)
    train_idx = idx[:n_train]
    val_idx = idx[n_train : n_train + n_val]
    test_idx = idx[n_train + n_val :]

    # Sanidade: sem overlap entre os 3 conjuntos.
    set_train, set_val, set_test = set(train_idx.tolist()), set(val_idx.tolist()), set(test_idx.tolist())
    assert set_train.isdisjoint(set_val), "Overlap train/val!"
    assert set_train.isdisjoint(set_test), "Overlap train/test!"
    assert set_val.isdisjoint(set_test), "Overlap val/test!"
    assert len(train_idx) + len(val_idx) + len(test_idx) == n, "Soma != N!"

    np.savez(
        out_path,
        train_idx=train_idx,
        val_idx=val_idx,
        test_idx=test_idx,
    )
    print(
        f"      train={len(train_idx):,} | val={len(val_idx):,} | test={len(test_idx):,}",
        flush=True,
    )
    return train_idx, val_idx, test_idx


# =====================================================================
# 6) Construção do modelo PyMC
# =====================================================================
def build_model(
    X_train: np.ndarray,
    y_log_train: np.ndarray,
    g_idx_train: np.ndarray,
    genero_cats: list[str],
) -> pm.Model:
    """Modelo hierárquico: intercept + slope por gênero, NCP parametrização.

    Priors:
      mu_alpha ~ N(0, 1.5), sigma_alpha ~ HalfN(1.5)
      mu_beta  ~ N(0, 1.0),  sigma_beta  ~ HalfN(1.0)  (per feature)
      z_alpha  ~ N(0, 1)    (per genero)
      z_beta   ~ N(0, 1)    (per genero x feature)

    Likelihood:
      y_log ~ N(mu_log, sigma_y) onde
        mu_log = alpha_g[g] + (X * beta_g[g]).sum(axis=1)
    """
    print("[5/8] Construindo modelo PyMC ...", flush=True)
    n_features = X_train.shape[1]
    coords = {"genero": genero_cats, "feature": K11_FEATS}

    with pm.Model(coords=coords) as model:
        # pm.Data -> re-bindable via pm.set_data (útil p/ val/test depois).
        X_data = pm.Data("X", X_train)
        g_data = pm.Data("genero_idx", g_idx_train)

        # Hiperpriors (population-level).
        mu_alpha = pm.Normal("mu_alpha", mu=0.0, sigma=1.5)
        sigma_alpha = pm.HalfNormal("sigma_alpha", sigma=1.5)

        mu_beta = pm.Normal("mu_beta", mu=0.0, sigma=1.0, dims="feature")
        sigma_beta = pm.HalfNormal("sigma_beta", sigma=1.0, dims="feature")

        # Variáveis não-centradas (z_) -> amostrador mais eficiente.
        z_alpha = pm.Normal("z_alpha", mu=0.0, sigma=1.0, dims="genero")
        z_beta = pm.Normal(
            "z_beta", mu=0.0, sigma=1.0, dims=("genero", "feature")
        )

        # Parâmetros por grupo (gênero) via NCP.
        alpha_g = pm.Deterministic(
            "alpha_g",
            mu_alpha + sigma_alpha * z_alpha,
            dims="genero",
        )
        beta_g = pm.Deterministic(
            "beta_g",
            mu_beta + sigma_beta * z_beta,
            dims=("genero", "feature"),
        )

        # Média linear: índice do grupo + produto interno por linha.
        mu_log = alpha_g[g_data] + (X_data * beta_g[g_data]).sum(axis=1)

        sigma_y = pm.HalfNormal("sigma_y", sigma=1.0)
        pm.Normal("y_log_obs", mu=mu_log, sigma=sigma_y, observed=y_log_train)

    print(f"      coords: genero={len(genero_cats)}, feature={n_features}", flush=True)
    return model


# =====================================================================
# 7) Fit + validação + persistência
# =====================================================================
def fit_and_persist(
    model: pm.Model,
    out_idata: Path,
    draws: int = 1000,
    tune: int = 1500,
    chains: int = 4,
):
    """Sampla, valida (r_hat, ESS, divergências) e salva artefatos.

    CRITICO: o posterior (k11_posterior.nc) e salvo IMEDIATAMENTE apos
    pm.sample, ANTES de qualquer diagnostico. Se az.summary ou qualquer
    coisa depois explodir, o fit NAO se perde.
    """
    total_iters = (tune + draws) * chains
    print(
        f"[6/8] Ajustando NUTS (numpyro, {chains} chains x {tune} tune + {draws} draws "
        f"= {total_iters:,} iteracoes totais) ...",
        flush=True,
    )
    print(f"      [progress] barra tqdm abaixo mostra cada chain em tempo real", flush=True)
    t0 = time.time()

    with model:
        idata = pm.sample(
            draws=draws,
            tune=tune,
            chains=chains,
            nuts_sampler="numpyro",
            target_accept=0.9,
            random_seed=SEED,
            progressbar=True,  # barra de progresso por chain
        )

    elapsed_min = (time.time() - t0) / 60.0
    elapsed_sec = time.time() - t0
    print(f"[7/8] Fit concluído em {elapsed_min:.2f} min ({elapsed_sec:.0f}s).", flush=True)
    if chains > 1:
        per_chain_min = elapsed_min / chains
        print(
            f"      ~{per_chain_min:.2f} min por chain, "
            f"{elapsed_sec / total_iters:.3f}s por iteracao",
            flush=True,
        )

    # ----- CHECKPOINT CRITICO: salvar o posterior AGORA -----
    # Antes de qualquer diagnostico, persistir o fit em disco.
    # Se algo depois explodir, o usuario nao perde o fit de 70 min.
    out_idata.parent.mkdir(parents=True, exist_ok=True)
    idata.to_netcdf(out_idata)
    print(f"      [checkpoint] posterior salvo em {out_idata}", flush=True)
    print(f"      [checkpoint] tamanho: {out_idata.stat().st_size / 1024:.1f} KB", flush=True)

    # ----- Validação de qualidade MCMC (WARNINGS, nao asserts) -----
    print("      Validando diagnósticos ...", flush=True)
    try:
        summary = az.summary(idata)
        r_hat = summary["r_hat"].to_numpy()
        ess_bulk = summary["ess_bulk"].to_numpy()
        n_diverging = int(idata.sample_stats["diverging"].sum().item())

        r_hat_max = float(np.nanmax(r_hat))
        ess_bulk_min = float(np.nanmin(ess_bulk))
        print(f"      r_hat max={r_hat_max:.4f}", flush=True)
        print(f"      ess_bulk min={ess_bulk_min:.1f}", flush=True)
        print(f"      divergências={n_diverging}", flush=True)

        # Limites:
        #   r_hat < 1.01  : chains bem misturadas
        #   ess_bulk > 400 : 400 amostras efetivas por parametro
        #   divergencias == 0 : sem trajetorias problematicas
        diagnostics_ok = True
        if r_hat_max >= 1.01:
            print(
                f"      [WARN] r_hat.max()={r_hat_max:.4f} >= 1.01 -- "
                f"chains podem nao ter convergido bem",
                flush=True,
            )
            diagnostics_ok = False
        if ess_bulk_min <= 400:
            print(
                f"      [WARN] ess_bulk.min()={ess_bulk_min:.1f} <= 400 -- "
                f"considere aumentar tune/draws",
                flush=True,
            )
            diagnostics_ok = False
        if n_diverging != 0:
            print(
                f"      [WARN] divergencias={n_diverging} != 0 -- "
                f"posterior pode ter regioes problematicas",
                flush=True,
            )
            diagnostics_ok = False
        if not diagnostics_ok:
            print(
                "      [INFO] O posterior FOI salvo mesmo assim. "
                "Avalie as metricas no evaluate.py antes de decidir re-treinar.",
                flush=True,
            )
    except Exception as e:
        # Diagnosticos falharam -- mas o posterior JA foi salvo.
        print(f"      [WARN] Falha ao computar diagnosticos: {e}", flush=True)
        print(f"      [INFO] Posterior esta salvo em {out_idata} mesmo assim.", flush=True)
        return idata, elapsed_min, np.array([1.0]), np.array([1.0]), 0

    # Imprime header final
    print("[8/8] Salvamento completo.", flush=True)
    return idata, elapsed_min, r_hat, ess_bulk, n_diverging


# =====================================================================
# 8) main
# =====================================================================
def main(
    draws: int = 1000,
    tune: int = 1500,
    chains: int = 4,
    out_dir: Path | None = None,
) -> None:
    """Pipeline de treino com checkpoint saving.

    Args:
        draws:  numero de samples por chain (default 1000).
        tune:   warmup iterations (default 1500).
        chains: numero de chains (default 4).
        out_dir: diretorio de saida. Se None, usa ARTIFACTS_DIR.
    """
    if out_dir is None:
        out_dir = ARTIFACTS_DIR
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 70, flush=True)
    print("train_k11 — Modelo Bayesiano Hierárquico K=11", flush=True)
    try:
        import jax
        n_dev = jax.local_device_count()
        backend = jax.default_backend()
        print(
            f"SEED={SEED} | K={len(K11_FEATS)} | jax backend={backend} | "
            f"devices={n_dev} | draws={draws} tune={tune} chains={chains} | "
            f"out={out_dir.name}",
            flush=True,
        )
    except Exception:
        print(
            f"SEED={SEED} | K={len(K11_FEATS)} | jax backend=unknown | "
            f"draws={draws} tune={tune} chains={chains}",
            flush=True,
        )
    print("=" * 70, flush=True)

    try:
        df = load_and_filter(DATA_PATH)
        df = build_k11(df)
        # make_scaler_and_arrays() NAO faz I/O -- apenas computa.
        X, y_log, scaler, genero_cats = make_scaler_and_arrays(df)

        # CHECKPOINT: salva side artifacts no out_dir CORRETO.
        # (Nao dentro de make_scaler_and_arrays() para respeitar --out-dir.)
        _save_side_artifacts(scaler, genero_cats, out_dir)

        # Split + indices (tambem salva split_indices.npz em out_dir).
        split_path = out_dir / "split_indices.npz"
        train_idx, val_idx, test_idx = split_indices(len(df), split_path)

        # Arrays de treino.
        X_train = X[train_idx]
        y_log_train = y_log[train_idx]
        genero_to_idx = {g: i for i, g in enumerate(genero_cats)}
        g_idx_train = (
            df["genero_principal"].iloc[train_idx].map(genero_to_idx).to_numpy().astype("int32")
        )

        # Modelo.
        model = build_model(X_train, y_log_train, g_idx_train, genero_cats)

        # Fit + CHECKPOINT do posterior (IMEDIATO apos pm.sample, dentro de fit_and_persist).
        out_idata = out_dir / "k11_posterior.nc"
        idata, elapsed_min, r_hat, ess_bulk, n_diverging = fit_and_persist(
            model, out_idata, draws=draws, tune=tune, chains=chains
        )

        # Relatorio final.
        print("", flush=True)
        print("=" * 70, flush=True)
        print("RESULTADO", flush=True)
        print(f"  tempo de fit      : {elapsed_min:.2f} min", flush=True)
        try:
            print(f"  r_hat range       : [{float(r_hat.min()):.4f}, {float(r_hat.max()):.4f}]", flush=True)
            print(
                f"  ess_bulk range    : [{float(ess_bulk.min()):.1f}, {float(ess_bulk.max()):.1f}]",
                flush=True,
            )
        except Exception:
            print("  diagnosticos indisponiveis (mas posterior foi salvo)", flush=True)
        print(f"  divergências      : {n_diverging}", flush=True)
        print(f"  #generos no modelo: {len(genero_cats)}", flush=True)
        print(f"  K (features)      : {len(K11_FEATS)}", flush=True)
        print("=" * 70, flush=True)
        print(
            f"\n[OK] Artefatos salvos em {out_dir}/. "
            f"Pode rodar evaluate.py mesmo se os diagnosticos estiverem ruins.",
            flush=True,
        )

    except Exception as e:
        # Log de erro em disco para o usuario poder debugar.
        import traceback
        error_path = out_dir / "_error.log"
        try:
            out_dir.mkdir(parents=True, exist_ok=True)
            with error_path.open("a", encoding="utf-8") as f:
                f.write(f"\n=== {time.strftime('%Y-%m-%d %H:%M:%S')} ===\n")
                f.write(f"{type(e).__name__}: {e}\n")
                f.write(traceback.format_exc())
            print(f"\n[ERRO] {type(e).__name__}: {e}", flush=True)
            print(f"[ERRO] Traceback salvo em {error_path}", flush=True)
        except Exception:
            pass
        raise


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="K=11 Bayesian hierarchical training.")
    parser.add_argument("--draws", type=int, default=1000, help="samples por chain")
    parser.add_argument("--tune", type=int, default=1500, help="warmup iterations")
    # Default de --chains: 4 em geral, ou o valor de K11_HOST_DEVICES se setado.
    _default_chains = _HOST_DEVICES if _HOST_DEVICES > 0 else 4
    parser.add_argument(
        "--chains", type=int, default=_default_chains,
        help=f"numero de chains (default: {_default_chains})",
    )
    parser.add_argument(
        "--out-dir", type=Path, default=None,
        help="diretorio de saida (default: artifacts/)",
    )
    args = parser.parse_args()
    main(
        draws=args.draws,
        tune=args.tune,
        chains=args.chains,
        out_dir=args.out_dir,
    )