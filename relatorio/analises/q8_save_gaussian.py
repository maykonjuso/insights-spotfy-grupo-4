"""Re-rodar save_coefs e save_forest_plots para o Gaussian NUTS."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

import arviz as az
import pandas as pd

from q8_bayes_hierarquico import (
    save_coefs, save_forest_plots, save_summary_plot,
    RESULTS_DIR, AUDIO_FEATURES,
)

# Recriar genero_cats
df = pd.read_parquet(r"C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\data\processed\spotify_tracks_limpo.parquet")
NON_MUSICAL = ['sleep', 'study', 'comedy', 'kids', 'children', 'new-age']

def is_non_music(s):
    if pd.isna(s): return False
    return any(g in NON_MUSICAL for g in str(s).lower().split())

df = df[~df['generos'].apply(is_non_music)].copy()
df_m = df[AUDIO_FEATURES + ['genero_principal', 'popularity']].dropna().copy()
df_m['explicit'] = df_m['explicit'].astype(int)
feats = AUDIO_FEATURES.copy()
feat_means = df_m[feats].mean()
feat_stds = df_m[feats].std()
df_m[feats] = (df_m[feats] - feat_means) / feat_stds
genero_cats = sorted(df_m['genero_principal'].unique())

# Carrega Gaussian NC
nc_path = os.path.join(RESULTS_DIR, 'q8_model_gaussian.nc')
idata = az.from_netcdf(nc_path)
print(f"Gaussian dims: {dict(idata.posterior.dims)}")

# Remove rows gaussian antigos do CSV (Bernoulli preservado)
coefs_path = os.path.join(RESULTS_DIR, 'q8_coefs_globais.csv')
if os.path.exists(coefs_path):
    df_old = pd.read_csv(coefs_path)
    df_old_bernoulli = df_old[df_old['model'] != 'gaussian']
    df_old_bernoulli.to_csv(coefs_path, index=False)
    print(f"Removi {len(df_old) - len(df_old_bernoulli)} linhas gaussian antigas")

coefs_por_genero_path = os.path.join(RESULTS_DIR, 'q8_coefs_por_genero.csv')
if os.path.exists(coefs_por_genero_path):
    df_old = pd.read_csv(coefs_por_genero_path)
    df_old_bernoulli = df_old[df_old['model'] != 'gaussian']
    df_old_bernoulli.to_csv(coefs_por_genero_path, index=False)
    print(f"Removi {len(df_old) - len(df_old_bernoulli)} linhas gaussian antigas em coefs_por_genero")

# Salva Gaussian
save_coefs(idata, feats, genero_cats, 'gaussian')
save_forest_plots(idata, feats, genero_cats, 'gaussian')
save_summary_plot(idata, feats, 'gaussian')
print('[done]')