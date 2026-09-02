"""
evaluate_k11.py — Avaliação offline do modelo K=11 em Val e Test.

Pipeline:
  1. Replica o pré-processamento de train_k11.py (filtro não-musicais,
     z-score, log1p, encoding de gênero) sobre spotify_tracks_limpo.parquet
     para garantir que os índices de split batem com o treinamento.
  2. Carrega o posterior k11_posterior.nc e sub-amostra 1000 dos 4000 draws
     (4 chains x 1000) com np.random.default_rng(42).
  3. Para cada um dos 1000 samples, monta mu_log_s e gera y_pred_s no
     espaço original de popularity via expm1 + clip [0, 100].
  4. Calcula RMSE, MAE, R^2, log-RMSE e cobertura do HDI 94% em Val e Test.
  5. Gera métricas por gênero (top-10 mais frequentes em Test) e tabela de
     calibração em 10 bins + ECE.
  6. Executa asserts (test_rmse<18, test_r2>0.30, hdi_coverage em (0.90, 0.97),
     sem NaN).
  7. Persiste CSVs e JSON de summary em relatorio/analises/resultados/.

Uso:
  python scripts/evaluate_k11.py

Dependências:
  arviz, numpy, pandas
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import arviz as az
import numpy as np
import pandas as pd

# =====================================================================
# Configuração global
# =====================================================================
SEED = 42
N_POSTERIOR_SAMPLES = 1000  # sub-amostra do posterior (de 4000)
HDI_PROB = 0.94
HDI_ALPHA = (1.0 - HDI_PROB) / 2.0  # 0.03 -> percentis 3 e 97

# Caminhos absolutos relativos ao REPO_ROOT.
REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = REPO_ROOT / "data" / "processed" / "spotify_tracks_limpo.parquet"
ARTIFACTS_DIR = REPO_ROOT / "artifacts"
RESULTS_DIR = REPO_ROOT / "relatorio" / "analises" / "resultados"

# Features e categorias: devem coincidir com train_k11.py.
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

# Mesma lista do training script.
NON_MUSICAL = ["sleep", "study", "comedy", "kids", "children", "new-age"]

# Limites para asserts.
TEST_RMSE_MAX = 18.0
TEST_R2_MIN = 0.30
HDI_COVERAGE_LO = 0.90
HDI_COVERAGE_HI = 0.97


# =====================================================================
# 1) Pré-processamento espelhado do train_k11.py
# =====================================================================
def load_and_filter(path: Path) -> pd.DataFrame:
    """Carrega parquet e remove gêneros não-musicais (mesma lógica do treino)."""
    print(f"[1/6] Lendo {path.relative_to(REPO_ROOT)} ...", flush=True)
    df = pd.read_parquet(path)

    pattern = "|".join(NON_MUSICAL)
    mask = df["generos"].fillna("").str.contains(pattern, case=False, regex=True)
    n_removed = int(mask.sum())
    df = df.loc[~mask].reset_index(drop=True).copy()
    print(
        f"      Removidos {n_removed} faixas não-musicais. Restantes: {len(df):,}",
        flush=True,
    )
    return df


def build_k11(df: pd.DataFrame) -> pd.DataFrame:
    """Garante tipos corretos e remove NaN nas colunas usadas no treino."""
    print("[2/6] Construindo K=11 e dropna ...", flush=True)
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


def apply_scaler(df: pd.DataFrame, scaler_path: Path) -> np.ndarray:
    """Aplica o scaler (salvo pelo treino) e devolve X float32 (N, 11).

    O scaler salvo contém apenas as 9 features contínuas. As binárias
    entram como estão (0/1), exatamente como o treino.
    """
    print(f"[3/6] Aplicando scaler de {scaler_path.relative_to(REPO_ROOT)} ...", flush=True)
    with scaler_path.open("r", encoding="utf-8") as f:
        scaler = json.load(f)

    X_cols: dict[str, np.ndarray] = {}
    for feat in CONTINUOUS_FEATS:
        s = scaler[feat]
        X_cols[feat] = (
            (df[feat].to_numpy() - s["mean"]) / s["std"]
        ).astype(np.float32)
    for feat in BINARY_FEATS:
        X_cols[feat] = df[feat].to_numpy().astype(np.float32)

    X = np.stack([X_cols[f] for f in K11_FEATS], axis=1).astype(np.float32)
    print(f"      X.shape={X.shape}", flush=True)
    return X


# =====================================================================
# 2) Predição amostrada
# =====================================================================
def sample_posterior(idata: az.InferenceData, n_samples: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Empilha (chain, draw) e sub-amostra n_samples com seed determinístico.

    Retorna:
      alpha_g_s  (n_samples, n_generos)
      beta_g_s   (n_samples, n_generos, K)
    """
    post = idata.posterior
    alpha_g = post["alpha_g"]  # dims: chain, draw, genero
    beta_g = post["beta_g"]    # dims: chain, draw, genero, feature

    alpha_g_flat = alpha_g.stack(sample=("chain", "draw")).transpose("sample", ...).values
    beta_g_flat = beta_g.stack(sample=("chain", "draw")).transpose("sample", ...).values

    n_total = alpha_g_flat.shape[0]
    rng = np.random.default_rng(seed)
    idx = rng.choice(n_total, size=n_samples, replace=False)

    alpha_g_s = alpha_g_flat[idx].astype(np.float32)
    beta_g_s = beta_g_flat[idx].astype(np.float32)
    print(f"      posterior sub-amostrado: {n_samples}/{n_total}", flush=True)
    return alpha_g_s, beta_g_s


def predict_posterior_popularity(
    alpha_g_s: np.ndarray,
    beta_g_s: np.ndarray,
    X: np.ndarray,
    g_idx: np.ndarray,
) -> np.ndarray:
    """Para cada sample s, retorna y_pred_s no espaço 0..100.

    alpha_g_s: (S, G)
    beta_g_s : (S, G, K)
    X        : (N, K)
    g_idx    : (N,)
    Retorna:
      y_pred_samples: (S, N), clipado em [0, 100]
    """
    # alpha_g_s[:, g_idx] -> (S, N)
    alpha_at_g = alpha_g_s[:, g_idx]
    # beta_g_s[:, g_idx, :] -> (S, N, K)
    beta_at_g = beta_g_s[:, g_idx, :]
    # produto interno por linha: (S, N, K) * (1, N, K) -> soma em K -> (S, N)
    mu_log = alpha_at_g + (beta_at_g * X[None, :, :]).sum(axis=-1)
    # Volta para popularity original via expm1 e clipa em [0, 100].
    y_pred = np.clip(np.exp(mu_log) - 1.0, 0.0, 100.0).astype(np.float32)
    return y_pred


# =====================================================================
# 3) Métricas
# =====================================================================
def _rmse(pred: np.ndarray, actual: np.ndarray) -> float:
    return float(np.sqrt(np.mean((pred - actual) ** 2)))


def _mae(pred: np.ndarray, actual: np.ndarray) -> float:
    return float(np.mean(np.abs(pred - actual)))


def _r2(pred: np.ndarray, actual: np.ndarray) -> float:
    ss_res = float(np.sum((actual - pred) ** 2))
    ss_tot = float(np.sum((actual - actual.mean()) ** 2))
    if ss_tot == 0.0:
        return float("nan")
    return float(1.0 - ss_res / ss_tot)


def _log_rmse(pred: np.ndarray, actual: np.ndarray) -> float:
    """RMSE no espaço log(popularity + 1)."""
    return _rmse(np.log(pred + 1.0), np.log(actual + 1.0))


def _hdi_coverage(lo: np.ndarray, hi: np.ndarray, actual: np.ndarray) -> float:
    """Fração de observações dentro do intervalo de credibilidade 94%."""
    return float(((actual >= lo) & (actual <= hi)).mean())


def compute_global_metrics(
    y_pred_samples: np.ndarray,
    y_actual: np.ndarray,
) -> dict[str, float]:
    """Métricas globais no espaço 0..100 a partir dos S samples por observação."""
    y_pred_mean = y_pred_samples.mean(axis=0)
    y_pred_lo = np.percentile(y_pred_samples, 100.0 * HDI_ALPHA, axis=0)
    y_pred_hi = np.percentile(y_pred_samples, 100.0 * (1.0 - HDI_ALPHA), axis=0)

    return {
        "rmse": _rmse(y_pred_mean, y_actual),
        "mae": _mae(y_pred_mean, y_actual),
        "r2": _r2(y_pred_mean, y_actual),
        "log_rmse": _log_rmse(y_pred_mean, y_actual),
        "hdi_94_coverage": _hdi_coverage(y_pred_lo, y_pred_hi, y_actual),
    }


def compute_per_genre_top10(
    y_pred_mean: np.ndarray,
    y_actual: np.ndarray,
    g_idx: np.ndarray,
    genero_cats: list[str],
) -> pd.DataFrame:
    """Métricas RMSE/MAE por gênero, apenas para os 10 mais frequentes."""
    counts = Counter(g_idx.tolist())
    top10 = [g for g, _ in counts.most_common(10)]
    rows = []
    for g in top10:
        mask = g_idx == g
        if int(mask.sum()) == 0:
            continue
        rows.append(
            {
                "genero": genero_cats[g],
                "n": int(mask.sum()),
                "rmse": _rmse(y_pred_mean[mask], y_actual[mask]),
                "mae": _mae(y_pred_mean[mask], y_actual[mask]),
            }
        )
    return pd.DataFrame(rows)


def compute_calibration(
    y_pred_mean: np.ndarray,
    y_actual: np.ndarray,
    n_bins: int = 10,
) -> tuple[pd.DataFrame, float]:
    """Calibração em 10 bins por decil de predição + ECE."""
    edges = np.quantile(y_pred_mean, np.linspace(0.0, 1.0, n_bins + 1))
    # Garante monotonicidade removendo duplicatas internas.
    edges = np.unique(edges)
    if len(edges) < 2:
        # Fallback degenerado: tudo em um único bin.
        edges = np.array([y_pred_mean.min(), y_pred_mean.max() + 1e-9])
    # Reconstrói para n_bins efetivos.
    bin_idx = np.digitize(y_pred_mean, edges[1:-1], right=False)
    bin_idx = np.clip(bin_idx, 0, len(edges) - 2)

    n_total = len(y_actual)
    rows = []
    ece = 0.0
    for b in range(len(edges) - 1):
        mask = bin_idx == b
        n_b = int(mask.sum())
        if n_b == 0:
            continue
        p_mean = float(y_pred_mean[mask].mean())
        y_mean = float(y_actual[mask].mean())
        ece += abs(p_mean - y_mean) * n_b / n_total
        rows.append(
            {
                "bin": b,
                "lo": float(edges[b]),
                "hi": float(edges[b + 1]),
                "n": n_b,
                "p_pred_mean": p_mean,
                "y_actual": y_mean,
            }
        )
    return pd.DataFrame(rows), float(ece)


# =====================================================================
# 4) Asserts
# =====================================================================
def run_asserts(metrics: dict[str, float]) -> None:
    """Executa asserts globais; levanta AssertionError se violados."""
    rmse = metrics["rmse"]
    r2 = metrics["r2"]
    hdi_cov = metrics["hdi_94_coverage"]

    # Sem NaN em nenhuma métrica.
    for k, v in metrics.items():
        assert not (isinstance(v, float) and np.isnan(v)), f"métrica '{k}' é NaN"

    assert rmse < TEST_RMSE_MAX, f"test_rmse={rmse:.4f} >= {TEST_RMSE_MAX}"
    assert r2 > TEST_R2_MIN, f"test_r2={r2:.4f} <= {TEST_R2_MIN}"
    assert HDI_COVERAGE_LO < hdi_cov < HDI_COVERAGE_HI, (
        f"hdi_coverage={hdi_cov:.4f} fora de "
        f"({HDI_COVERAGE_LO}, {HDI_COVERAGE_HI})"
    )


# =====================================================================
# 5) Persistência
# =====================================================================
def _write_metrics_csv(path: Path, metrics: dict[str, float]) -> None:
    df = pd.DataFrame(
        [{"metric": k, "value": float(v)} for k, v in metrics.items()]
    )
    df.to_csv(path, index=False)


def main() -> None:
    print("=" * 70, flush=True)
    print("evaluate_k11 — Avaliação offline K=11 (Val + Test)", flush=True)
    print(
        f"SEED={SEED} | n_samples={N_POSTERIOR_SAMPLES} | HDI={HDI_PROB:.0%}",
        flush=True,
    )
    print("=" * 70, flush=True)

    # --- Carregamento + pré-processamento espelhado do treino ---
    df = load_and_filter(DATA_PATH)
    df = build_k11(df)

    scaler_path = ARTIFACTS_DIR / "scaler.json"
    cats_path = ARTIFACTS_DIR / "genero_cats.json"
    posterior_path = ARTIFACTS_DIR / "k11_posterior.nc"
    split_path = ARTIFACTS_DIR / "split_indices.npz"

    X = apply_scaler(df, scaler_path)
    y_pop = df["popularity"].to_numpy().astype(np.float32)
    y_log = np.log(y_pop + 1.0).astype(np.float32)

    with cats_path.open("r", encoding="utf-8") as f:
        genero_cats: list[str] = json.load(f)
    genero_to_idx = {g: i for i, g in enumerate(genero_cats)}
    g_idx = (
        df["genero_principal"].astype(str).map(genero_to_idx).to_numpy().astype("int32")
    )

    # Garante que nenhum gênero do df limpo ficou fora de genero_cats.
    unknown = int((g_idx < 0).sum())
    assert unknown == 0, f"{unknown} faixas têm gênero fora de genero_cats.json"

    # --- Splits ---
    split = np.load(split_path)
    train_idx = split["train_idx"]
    val_idx = split["val_idx"]
    test_idx = split["test_idx"]
    assert len(set(train_idx.tolist()) & set(val_idx.tolist())) == 0, "overlap train/val"
    assert len(set(train_idx.tolist()) & set(test_idx.tolist())) == 0, "overlap train/test"
    assert len(set(val_idx.tolist()) & set(test_idx.tolist())) == 0, "overlap val/test"
    print(
        f"      splits: train={len(train_idx):,} | val={len(val_idx):,} "
        f"| test={len(test_idx):,}",
        flush=True,
    )

    # --- Carrega posterior ---
    print(f"[4/6] Carregando posterior {posterior_path.relative_to(REPO_ROOT)} ...", flush=True)
    idata = az.from_netcdf(posterior_path)
    alpha_g_s, beta_g_s = sample_posterior(idata, N_POSTERIOR_SAMPLES, SEED)

    # --- Predição em Val e Test (pipeline idêntica) ---
    print("[5/6] Predição em Val e Test ...", flush=True)
    X_val, g_val, y_val = X[val_idx], g_idx[val_idx], y_pop[val_idx]
    X_test, g_test, y_test = X[test_idx], g_idx[test_idx], y_pop[test_idx]

    y_pred_val = predict_posterior_popularity(alpha_g_s, beta_g_s, X_val, g_val)
    y_pred_test = predict_posterior_popularity(alpha_g_s, beta_g_s, X_test, g_test)

    # --- Métricas ---
    val_metrics = compute_global_metrics(y_pred_val, y_val)
    test_metrics = compute_global_metrics(y_pred_test, y_test)

    print(f"      Val  RMSE={val_metrics['rmse']:.3f}  "
          f"MAE={val_metrics['mae']:.3f}  R²={val_metrics['r2']:.3f}  "
          f"log-RMSE={val_metrics['log_rmse']:.3f}  "
          f"HDI94={val_metrics['hdi_94_coverage']:.3f}", flush=True)
    print(f"      Test RMSE={test_metrics['rmse']:.3f}  "
          f"MAE={test_metrics['mae']:.3f}  R²={test_metrics['r2']:.3f}  "
          f"log-RMSE={test_metrics['log_rmse']:.3f}  "
          f"HDI94={test_metrics['hdi_94_coverage']:.3f}", flush=True)

    # --- Per-gênero (top 10 em Test) ---
    y_pred_test_mean = y_pred_test.mean(axis=0)
    per_genre_df = compute_per_genre_top10(y_pred_test_mean, y_test, g_test, genero_cats)
    print("      Per-gênero (Test, top 10):", flush=True)
    for _, row in per_genre_df.iterrows():
        print(
            f"        {row['genero']:24s} n={int(row['n']):5d}  "
            f"RMSE={row['rmse']:.3f}  MAE={row['mae']:.3f}",
            flush=True,
        )

    # --- Calibração (Test) ---
    calib_df, ece = compute_calibration(y_pred_test_mean, y_test, n_bins=10)
    print(f"      ECE (Test) = {ece:.4f}", flush=True)

    # --- Asserts ---
    assertions_passed = True
    try:
        run_asserts(test_metrics)
        print("[6/6] Asserts OK", flush=True)
    except AssertionError as exc:
        assertions_passed = False
        print(f"[6/6] ASSERT VIOLADO: {exc}", flush=True)

    # --- Persistência ---
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    val_csv = RESULTS_DIR / "q11_val_metrics.csv"
    test_csv = RESULTS_DIR / "q11_test_metrics.csv"
    per_genre_csv = RESULTS_DIR / "q11_per_genre.csv"
    calib_csv = RESULTS_DIR / "q11_calibration.csv"
    summary_json = RESULTS_DIR / "q11_summary.json"

    _write_metrics_csv(val_csv, val_metrics)
    _write_metrics_csv(test_csv, test_metrics)
    per_genre_df.to_csv(per_genre_csv, index=False)
    calib_df.to_csv(calib_csv, index=False)

    summary = {
        "val": val_metrics,
        "test": test_metrics,
        "per_genre_top10_test": per_genre_df.to_dict(orient="records"),
        "calibration_test": {
            "ece": ece,
            "bins": calib_df.to_dict(orient="records"),
        },
        "n_posterior_samples": int(N_POSTERIOR_SAMPLES),
        "hdi_prob": HDI_PROB,
        "assertions": {
            "test_rmse_max": TEST_RMSE_MAX,
            "test_r2_min": TEST_R2_MIN,
            "hdi_coverage_range": [HDI_COVERAGE_LO, HDI_COVERAGE_HI],
            "passed": bool(assertions_passed),
        },
        "splits": {
            "n_val": int(len(val_idx)),
            "n_test": int(len(test_idx)),
        },
    }
    with summary_json.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print("", flush=True)
    print("=" * 70, flush=True)
    print("ARTEFATOS SALVOS", flush=True)
    print(f"  {val_csv.relative_to(REPO_ROOT)}", flush=True)
    print(f"  {test_csv.relative_to(REPO_ROOT)}", flush=True)
    print(f"  {per_genre_csv.relative_to(REPO_ROOT)}", flush=True)
    print(f"  {calib_csv.relative_to(REPO_ROOT)}", flush=True)
    print(f"  {summary_json.relative_to(REPO_ROOT)}", flush=True)
    print(f"  assertions_passed = {assertions_passed}", flush=True)
    print("=" * 70, flush=True)

    # Se asserts falharam, propaga.
    if not assertions_passed:
        raise AssertionError(
            f"Test metrics fora dos limites. RMSE={test_metrics['rmse']:.4f}, "
            f"R²={test_metrics['r2']:.4f}, HDI94={test_metrics['hdi_94_coverage']:.4f}"
        )


if __name__ == "__main__":
    main()