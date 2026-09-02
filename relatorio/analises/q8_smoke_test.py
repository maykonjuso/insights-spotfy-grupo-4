"""Smoke test para q8_bayes_hierarquico.py — só valida load/clean/prepare."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import q8_bayes_hierarquico as q8

df = q8.load_data()
df_clean, report = q8.clean_data(df, drop_zero_pop=True)
print()
print(report.to_string(index=False))
print()

df_m, feats, genero_cats = q8.prepare_model_data(df_clean)
print(f'n apos prepare: {len(df_m):,}')
print(f'n generos: {len(genero_cats)}')
print(f'top25 rate: {df_m["top25"].mean():.3f}')
print(f'feats padronizadas - min/max: {df_m[feats].min().min():.2f} / {df_m[feats].max().max():.2f}')
print()
print('primeiras 5 genero_cats:', genero_cats[:5])