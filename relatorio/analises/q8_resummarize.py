"""Re-gera CSVs e plots a partir dos pickles salvos (sem re-fitar)."""
import os
import pickle
import sys
sys.path.insert(0, os.path.dirname(__file__))

import arviz as az
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from q8_bayes_hierarquico import (
    save_coefs, save_forest_plots, save_summary_plot, save_sigma_plot,
    RESULTS_DIR, AUDIO_FEATURES, _manual_forest,
)

# Recriar genero_cats (mesma logica do script principal)
DATA_PARQUET = os.path.join(
    r"C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4",
    "data", "processed", "spotify_tracks_limpo.parquet",
)
df = pd.read_parquet(DATA_PARQUET)
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

# Carrega pickles e gera artifacts
for fam in ['gaussian', 'bernoulli']:
    pkl_path = os.path.join(RESULTS_DIR, f'q8_model_{fam}.pkl')
    if not os.path.exists(pkl_path):
        print(f"{fam}: pickle nao encontrado, pulando")
        continue
    with open(pkl_path, 'rb') as f:
        idata = pickle.load(f)
    print(f"=== {fam} ===")
    save_coefs(idata, feats, genero_cats, fam)
    save_forest_plots(idata, feats, genero_cats, fam)
    save_summary_plot(idata, feats, fam)

# Sigma plot cross-model
save_sigma_plot()
print('[done]')