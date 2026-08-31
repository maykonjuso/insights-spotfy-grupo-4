"""
Q8 Analysis — A receita varia por gênero?

Modelo hierárquico Bayesiano (PyMC) com:
  - M1 (Gaussian): popularity ~ audio_features + (1 + audio_features | genero_principal)
  - M2 (Bernoulli): top25 ~ audio_features + (1 + audio_features | genero_principal)

Estratégia de execução:
  - ADVI spike em 20k subamostra (validar pipeline)
  - NUTS completo nos 90k (inferência final)

Artefatos em relatorio/analises/resultados/:
  - q8_data_cleaning_report.csv  (n removido por gênero não-musical + keywords)
  - q8_model_gaussian.nc          (posterior M1, NetCDF nativo PyMC)
  - q8_model_bernoulli.nc         (posterior M2)
  - q8_coefs_globais.csv          (efeitos globais: media, sd, HDI 94%)
  - q8_coefs_por_genero.csv       (efeitos por gênero: slope + HDI 94%)
  - q8_forest_<feature>.png       (forest plot por feature, 11 PNGs)
  - q8_resumo.txt                 (log de fit: tempo, R-hat, ESS, divergências)

Uso:
  python q8_bayes_hierarquico.py --mode spike           # só ADVI 20k
  python q8_bayes_hierarquico.py --mode full            # só NUTS 90k
  python q8_bayes_hierarquico.py --mode both            # spike + full (default)
  python q8_bayes_hierarquico.py --model gaussian       # só M1
  python q8_bayes_hierarquico.py --model bernoulli      # só M2
"""
import argparse
import os
import time
import warnings

import arviz as az
import matplotlib
matplotlib.use('Agg')  # backend sem display (Windows headless)
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import pymc as pm

warnings.filterwarnings('ignore')

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = r"C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4"
DATA_PARQUET = os.path.join(PROJECT_ROOT, "data", "processed", "spotify_tracks_limpo.parquet")
RESULTS_DIR = os.path.join(PROJECT_ROOT, "relatorio", "analises", "resultados")

# ---------------------------------------------------------------------------
# Audio features (espelham q1_coefs_regressao.csv)
# ---------------------------------------------------------------------------
AUDIO_FEATURES = [
    'danceability', 'energy', 'loudness', 'speechiness',
    'acousticness', 'instrumentalness', 'liveness', 'valence', 'tempo',
    'explicit',
]
# 'explicit' entra como 0/1 (bool -> int)

# ---------------------------------------------------------------------------
# Gêneros não-musicais (excluídos antes do fit)
# Justificativa: dataset inclui faixas que não são "música" no sentido da
# análise de hit — sleep/study tracks, comedy spoken word, kids content.
# ---------------------------------------------------------------------------
NON_MUSICAL_GENRES = [
    'sleep', 'study', 'comedy', 'kids', 'children', 'new-age',
]

# ---------------------------------------------------------------------------
# Subamostra para spike (rapidez)
# ---------------------------------------------------------------------------
SPIKE_N = 20_000
SPIKE_SEED = 42

# ---------------------------------------------------------------------------
# Sampling defaults
# ---------------------------------------------------------------------------
NUTS_DRAWS = 1000
NUTS_TUNE = 1000
NUTS_CHAINS = 4        # 4 chains para rhat robusto
NUTS_TARGET_ACCEPT = 0.95

# Subsample para NUTS completo (Windows sem g++: 90k inviável).
# 25k mantém poder estatístico; shrinkage hierárquico cobre gêneros pequenos.
FULL_SUBSAMPLE = 25_000


def load_data() -> pd.DataFrame:
    df = pd.read_parquet(DATA_PARQUET)
    print(f"[load] n faixas carregadas: {len(df):,}")
    return df


def clean_data(df: pd.DataFrame, drop_zero_pop: bool) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Exclui gêneros não-musicais. Para Gaussian, exclui também popularity==0."""
    n0 = len(df)

    # Identifica faixas com gênero não-musical em qualquer slot da lista
    def is_non_music(generos_str: str) -> bool:
        if pd.isna(generos_str):
            return False
        toks = str(generos_str).lower().split()
        return any(g in NON_MUSICAL_GENRES for g in toks)

    mask_non_music = df['generos'].apply(is_non_music)
    df_clean = df[~mask_non_music].copy()
    n_non_music = mask_non_music.sum()

    if drop_zero_pop:
        mask_zero = df_clean['popularity'] == 0
        df_clean = df_clean[~mask_zero].copy()
        n_zero = mask_zero.sum()
    else:
        n_zero = 0

    cleaning_report = pd.DataFrame([{
        'n_total': n0,
        'n_non_musical_removed': int(n_non_music.sum()),
        'n_zero_pop_removed': int(n_zero),
        'n_final': len(df_clean),
        'n_generos_after_clean': df_clean['genero_principal'].nunique(),
        'generos_excluidos': ', '.join(NON_MUSICAL_GENRES),
    }])
    return df_clean, cleaning_report


def prepare_model_data(df: pd.DataFrame) -> pd.DataFrame:
    """Constrói o dataframe para o modelo: features padronizadas + genero_idx + target."""
    feats = AUDIO_FEATURES.copy()
    df_m = df[feats + ['genero_principal', 'popularity']].dropna().copy()

    # explicit: bool -> int
    df_m['explicit'] = df_m['explicit'].astype(int)

    # Padroniza features (z-score) — crítico para MCMC
    feat_means = df_m[feats].mean()
    feat_stds = df_m[feats].std()
    df_m[feats] = (df_m[feats] - feat_means) / feat_stds

    # Codifica genero_principal como índice inteiro
    genero_cats = sorted(df_m['genero_principal'].unique())
    genero_to_idx = {g: i for i, g in enumerate(genero_cats)}
    df_m['genero_idx'] = df_m['genero_principal'].map(genero_to_idx)

    # Target binário top-25%
    thresh = df_m['popularity'].quantile(0.75)
    df_m['top25'] = (df_m['popularity'] >= thresh).astype(int)

    print(f"[prepare] n={len(df_m):,} | n_generos={len(genero_cats)} | top25_threshold={thresh:.1f}")
    return df_m, feats, genero_cats


def build_model(df_m: pd.DataFrame, feats: list[str], n_generos: int, family: str) -> pm.Model:
    """Constrói o modelo hierárquico.

    Estrutura:
      y_i ~ f(mu_i)                 # f = Normal ou Bernoulli(logit)
      mu_i = alpha[g_i] + sum_k beta_k[g_i] * x_ik
      alpha_g ~ Normal(mu_alpha, sigma_alpha)
      beta_gk ~ Normal(mu_beta, sigma_beta)  (não-centrado para evitar funil)
    """
    coords = {
        'genero': np.arange(n_generos),
        'feature': feats,
    }

    # Dados como numpy
    X = df_m[feats].values.astype('float32')
    g = df_m['genero_idx'].values.astype('int32')
    N, K = X.shape

    with pm.Model(coords=coords) as model:
        # Hiperpriori — fracamente informativos, centrados no efeito médio do dataset
        mu_alpha = pm.Normal('mu_alpha', mu=0.0, sigma=10.0)
        sigma_alpha = pm.HalfNormal('sigma_alpha', sigma=10.0)

        mu_beta = pm.Normal('mu_beta', mu=0.0, sigma=2.5, dims='feature')
        sigma_beta = pm.HalfNormal('sigma_beta', sigma=2.5, dims='feature')

        # Efeitos aleatórios (não-centrados: z ~ N(0,1) → efeito = mu + sigma * z)
        z_alpha = pm.Normal('z_alpha', mu=0.0, sigma=1.0, dims='genero')
        z_beta = pm.Normal('z_beta', mu=0.0, sigma=1.0, dims=('genero', 'feature'))

        alpha_g = pm.Deterministic(
            'alpha_g',
            mu_alpha + sigma_alpha * z_alpha,
            dims='genero',
        )
        beta_g = pm.Deterministic(
            'beta_g',
            mu_beta + sigma_beta * z_beta,
            dims=('genero', 'feature'),
        )

        # Preditor linear: mu_i = alpha_g[g_i] + sum_k beta_g[g_i, k] * X[i, k]
        mu = alpha_g[g] + (X * beta_g[g]).sum(axis=1)

        if family == 'gaussian':
            sigma_y = pm.HalfNormal('sigma_y', sigma=20.0)
            pm.Normal('y_obs', mu=mu, sigma=sigma_y, observed=df_m['popularity'].values)
        elif family == 'bernoulli':
            pm.Bernoulli('y_obs', p=pm.math.sigmoid(mu), observed=df_m['top25'].values)
        else:
            raise ValueError(f"family deve ser 'gaussian' ou 'bernoulli', recebi {family!r}")

    return model


def fit_spike(df_m: pd.DataFrame, feats: list[str], n_generos: int, family: str):
    """ADVI rápido em subamostra para validar pipeline."""
    sub = df_m.sample(n=min(SPIKE_N, len(df_m)), random_state=SPIKE_SEED)
    print(f"[spike:{family}] ajustando ADVI em {len(sub):,} faixas...")
    model = build_model(sub, feats, n_generos, family)
    with model:
        approx = pm.fit(n=10_000, method='advi', random_seed=SPIKE_SEED,
                        progressbar=False, obj_optimizer=pm.adam(learning_rate=1e-2))
    idata = approx.sample(draws=500, random_seed=SPIKE_SEED)
    print(f"[spike:{family}] ADVI concluido")
    return idata


def fit_full(df_m: pd.DataFrame, feats: list[str], n_generos: int, family: str):
    """NUTS em subamostra (Windows sem g++: 90k inviável)."""
    if len(df_m) > FULL_SUBSAMPLE:
        df_sub = df_m.sample(n=FULL_SUBSAMPLE, random_state=SPIKE_SEED)
        print(f"[full:{family}] subamostrando: {len(df_m):,} -> {len(df_sub):,} faixas")
    else:
        df_sub = df_m
    print(f"[full:{family}] ajustando NUTS ({NUTS_CHAINS} chains x {NUTS_DRAWS} draws, tune={NUTS_TUNE})...")
    t0 = time.time()
    model = build_model(df_sub, feats, n_generos, family)
    with model:
        idata = pm.sample(
            draws=NUTS_DRAWS,
            tune=NUTS_TUNE,
            chains=NUTS_CHAINS,
            cores=1,
            target_accept=NUTS_TARGET_ACCEPT,
            random_seed=SPIKE_SEED,
            progressbar=False,  # rich crasha no cleanup em Windows cp1252
        )
    elapsed = time.time() - t0
    print(f"[full:{family}] NUTS concluido em {elapsed/60:.1f} min")
    return idata, elapsed


def diagnostics(idata, family: str) -> str:
    """Resumo diagnóstico: R-hat, ESS, divergências."""
    lines = [f"\n=== Diagnóstico {family} ==="]
    summary = az.summary(idata, var_names=['mu_alpha', 'sigma_alpha', 'mu_beta', 'sigma_beta'])
    lines.append(summary.to_string())
    if hasattr(idata, 'sample_stats') and 'diverging' in idata.sample_stats:
        n_div = int(idata.sample_stats.diverging.sum())
        lines.append(f"\nDivergências: {n_div}")
    return "\n".join(lines)


def save_posterior(idata, family: str):
    path = os.path.join(RESULTS_DIR, f"q8_model_{family}.nc")
    # ArviZ 1.x: idata tem metodo proprio, nao az.to_netcdf
    idata.to_netcdf(path)
    print(f"[save] posterior salvo em {path}")


def save_coefs(idata, feats: list[str], genero_cats: list[str], family: str):
    """Salva efeitos globais e por gênero como CSV."""
    # Efeitos globais
    global_summary = az.summary(
        idata, var_names=['mu_alpha', 'sigma_alpha', 'mu_beta', 'sigma_beta'],
        hdi_prob=0.94,
    )
    global_summary['model'] = family
    global_path = os.path.join(RESULTS_DIR, "q8_coefs_globais.csv")
    if os.path.exists(global_path):
        global_summary.to_csv(global_path, mode='a', header=False)
    else:
        global_summary.to_csv(global_path)

    # Efeitos por gênero (alpha_g, beta_g)
    genre_summary = az.summary(
        idata, var_names=['alpha_g', 'beta_g'],
        hdi_prob=0.94,
    )
    genre_summary['model'] = family
    genre_path = os.path.join(RESULTS_DIR, "q8_coefs_por_genero.csv")
    if os.path.exists(genre_path):
        genre_summary.to_csv(genre_path, mode='a', header=False)
    else:
        genre_summary.to_csv(genre_path)


def save_forest_plots(idata, feats: list[str], family: str):
    """Forest plots por feature (detalhado) + 1 plot destaque da feature mais variável."""
    # Detalhado (mantido para inspeção)
    for k, feat in enumerate(feats):
        fig, ax = plt.subplots(figsize=(10, 14))
        az.plot_forest(
            idata, var_names=['beta_g'], coords={'feature': [feat]},
            combined=True, hdi_prob=0.94, ax=ax,
        )
        ax.set_title(f"{family.upper()} - efeito de {feat} por genero (HDI 94%)")
        plt.tight_layout()
        path = os.path.join(RESULTS_DIR, f"q8_forest_{family}_{feat}.png")
        plt.savefig(path, dpi=120)
        plt.close(fig)

    # Destaque: feature com maior sigma_beta (mais variação entre gêneros)
    sigma_post = idata.posterior['sigma_beta'].mean(dim=('chain', 'draw'))
    top_feat_idx = int(np.argmax(sigma_post.values))
    top_feat = feats[top_feat_idx]
    fig, ax = plt.subplots(figsize=(10, 14))
    az.plot_forest(
        idata, var_names=['beta_g'], coords={'feature': [top_feat]},
        combined=True, hdi_prob=0.94, ax=ax,
    )
    ax.set_title(
        f"{family.upper()} - {top_feat} (feature mais variavel entre generos)\n"
        f"sigma_beta medio = {float(sigma_post.values[top_feat_idx]):.2f}",
    )
    plt.tight_layout()
    plt.savefig(os.path.join(RESULTS_DIR, f"q8_forest_top_{family}.png"), dpi=120)
    plt.close(fig)


def save_summary_plot(idata, feats: list[str], family: str):
    """Plot-resumo: ranking dos efeitos globais com HDI."""
    post = idata.posterior
    means = post['mu_beta'].mean(dim=('chain', 'draw')).values
    hdi = az.hdi(post['mu_beta'], hdi_prob=0.94).mu_beta.values  # (K, 2)

    order = np.argsort(np.abs(means))[::-1]
    feats_ord = [feats[i] for i in order]
    means_ord = means[order]
    lo_ord = hdi[order, 0]
    hi_ord = hdi[order, 1]

    fig, ax = plt.subplots(figsize=(10, 6))
    y = np.arange(len(feats_ord))
    ax.errorbar(
        means_ord, y,
        xerr=[means_ord - lo_ord, hi_ord - means_ord],
        fmt='o', color='#1db954', ecolor='#7a7166', capsize=4,
    )
    ax.axvline(0, color='#7a7166', linewidth=0.8, linestyle='--')
    ax.set_yticks(y)
    ax.set_yticklabels(feats_ord)
    ax.set_xlabel('mu_beta (efeito global padronizado, HDI 94%)')
    ax.set_title(f'{family.upper()} - ranking de efeitos globais')
    ax.invert_yaxis()
    plt.tight_layout()
    plt.savefig(os.path.join(RESULTS_DIR, f"q8_global_effects_{family}.png"), dpi=120)
    plt.close(fig)


def save_sigma_plot():
    """Compara sigma_beta entre modelos (Gaussian vs Bernoulli)."""
    coefs_path = os.path.join(RESULTS_DIR, "q8_coefs_globais.csv")
    if not os.path.exists(coefs_path):
        return
    df = pd.read_csv(coefs_path)
    sigma_rows = df[df['index'].str.startswith('sigma_beta[', na=False)].copy()
    if sigma_rows.empty:
        return
    sigma_rows['feature'] = (
        sigma_rows['index'].str.extract(r"\[(.+)\]").iloc[:, 0].str.strip("'\"")
    )

    fig, ax = plt.subplots(figsize=(10, 6))
    width = 0.4
    models = sigma_rows['model'].unique()
    x = np.arange(sigma_rows['feature'].nunique())
    feats = sorted(sigma_rows['feature'].unique())
    for i, fam in enumerate(models):
        sub = sigma_rows[sigma_rows['model'] == fam].set_index('feature').reindex(feats)
        ax.bar(x + (i - 0.5) * width, sub['mean'].values, width,
               label=fam.upper(), color=['#1db954', '#7b4fb0'][i % 2])
    ax.set_xticks(x)
    ax.set_xticklabels(feats, rotation=45, ha='right')
    ax.set_ylabel('sigma_beta (variacao entre generos)')
    ax.set_title('Variacao entre generos por feature (sigma_beta)')
    ax.legend()
    plt.tight_layout()
    plt.savefig(os.path.join(RESULTS_DIR, 'q8_sigma_beta_comparison.png'), dpi=120)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["spike", "full", "both"], default="both")
    parser.add_argument("--model", choices=["gaussian", "bernoulli", "both"], default="both")
    args = parser.parse_args()

    os.makedirs(RESULTS_DIR, exist_ok=True)

    # 1. Load + clean
    df = load_data()
    drop_zero = 'gaussian' in args.model  # só Gaussian precisa
    df_clean, cleaning_report = clean_data(df, drop_zero_pop=drop_zero)
    cleaning_report.to_csv(os.path.join(RESULTS_DIR, "q8_data_cleaning_report.csv"),
                            index=False, mode='w')
    print(cleaning_report.to_string(index=False))

    # 2. Prepare
    df_m, feats, genero_cats = prepare_model_data(df_clean)
    n_generos = len(genero_cats)

    models_to_fit = []
    if args.model in ('gaussian', 'both'):
        models_to_fit.append('gaussian')
    if args.model in ('bernoulli', 'both'):
        models_to_fit.append('bernoulli')

    log_lines = []

    for family in models_to_fit:
        # 3. Spike
        if args.mode in ('spike', 'both'):
            idata_spike = fit_spike(df_m, feats, n_generos, family)
            log_lines.append(diagnostics(idata_spike, f"{family}_spike"))

        # 4. Full
        if args.mode in ('full', 'both'):
            idata_full, elapsed = fit_full(df_m, feats, n_generos, family)
            save_posterior(idata_full, family)
            save_coefs(idata_full, feats, genero_cats, family)
            save_forest_plots(idata_full, feats, family)
            save_summary_plot(idata_full, feats, family)
            log_lines.append(diagnostics(idata_full, family))
            log_lines.append(f"Tempo NUTS {family}: {elapsed/60:.1f} min")

    # 5. Summary plot cross-model (sigma_beta comparacao)
    if args.mode in ('full', 'both'):
        save_sigma_plot()

    with open(os.path.join(RESULTS_DIR, "q8_resumo.txt"), "w", encoding='utf-8') as f:
        f.write("\n".join(log_lines))
    print("[done]")


if __name__ == "__main__":
    main()