"""
Q7 Analysis: O que os percentis mais baixo e mais alto de popularidade têm em comum?
"""
import pandas as pd
import numpy as np
from scipy.stats import mannwhitneyu, chi2_contingency
from statsmodels.stats.multitest import multipletests

# Load data
df = pd.read_parquet(r'C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\data\processed\spotify_tracks_limpo.parquet')

print(f"Total de faixas: {len(df):,}")

# 1. Define percentis
p10 = df['popularity'].quantile(0.10)
p90 = df['popularity'].quantile(0.90)
print(f"Percentil 10 (P10) = {p10}")
print(f"Percentil 90 (P90) = {p90}")
print(f"Mediana = {df['popularity'].median()}, Média = {df['popularity'].mean():.2f}")
print(f"Min = {df['popularity'].min()}, Max = {df['popularity'].max()}\n")

# 2. Define top e bottom
top_mask = df['popularity'] >= p90
bottom_mask = df['popularity'] <= p10

top = df[top_mask].copy()
bottom = df[bottom_mask].copy()

print(f"Top (popularity >= {p90}): {len(top):,} faixas")
print(f"Bottom (popularity <= {p10}): {len(bottom):,} faixas\n")

# 3. Características numéricas a serem analisadas
numeric_features = ['danceability', 'energy', 'loudness', 'speechiness',
                    'acousticness', 'instrumentalness', 'liveness', 'valence',
                    'tempo', 'duration_ms', 'n_generos', 'n_artistas']

# 4. Estatísticas descritivas
print("="*100)
print("ESTATÍSTICAS DESCRITIVAS (médias e medianas)")
print("="*100)

desc_rows = []
for feat in numeric_features:
    top_vals = top[feat].dropna()
    bot_vals = bottom[feat].dropna()
    desc_rows.append({
        'feature': feat,
        'top_mean': top_vals.mean(),
        'top_median': top_vals.median(),
        'top_std': top_vals.std(),
        'bottom_mean': bot_vals.mean(),
        'bottom_median': bot_vals.median(),
        'bottom_std': bot_vals.std(),
    })

desc_df = pd.DataFrame(desc_rows)
print(desc_df.to_string(index=False))
print()

# 5. Testes Mann-Whitney U para cada feature numérica
print("="*100)
print("TESTES MANN-WHITNEY U (Top vs Bottom) com FDR")
print("="*100)

mw_results = []
for feat in numeric_features:
    top_vals = top[feat].dropna().values
    bot_vals = bottom[feat].dropna().values
    u_stat, p_val = mannwhitneyu(top_vals, bot_vals, alternative='two-sided')
    n1, n2 = len(top_vals), len(bot_vals)
    r = 1 - (2*u_stat)/(n1*n2)  # rank-biserial correlation
    mw_results.append({
        'feature': feat,
        'U': u_stat,
        'p_value': p_val,
        'n_top': n1,
        'n_bottom': n2,
        'rank_biserial_r': r
    })

mw_df = pd.DataFrame(mw_results)
# FDR correction (Benjamini-Hochberg)
pvals = mw_df['p_value'].values
rejected, pvals_fdr, _, _ = multipletests(pvals, alpha=0.01, method='fdr_bh')
mw_df['p_fdr'] = pvals_fdr
mw_df['significant_001'] = rejected
print(mw_df.to_string(index=False))
print()

# 6. Teste Chi-quadrado para 'explicit' (yes/no)
print("="*100)
print("TESTE QUI-QUADRADO - EXPLICIT")
print("="*100)

# Use contingency table directly
top_explicit_yes = int(top['explicit'].sum())
top_explicit_no = int(len(top) - top_explicit_yes)
bot_explicit_yes = int(bottom['explicit'].sum())
bot_explicit_no = int(len(bottom) - bot_explicit_yes)

ct_explicit = np.array([
    [top_explicit_yes, top_explicit_no],
    [bot_explicit_yes, bot_explicit_no]
])
print("Tabela de contingência (explicit):")
print("               explicit=True  explicit=False")
print(f"Top           {ct_explicit[0,0]:>10}  {ct_explicit[0,1]:>10}")
print(f"Bottom        {ct_explicit[1,0]:>10}  {ct_explicit[1,1]:>10}")

chi2_exp, p_explicit, dof_exp, expected_exp = chi2_contingency(ct_explicit)
n_total_exp = ct_explicit.sum()
cramers_v_explicit = np.sqrt(chi2_exp / (n_total_exp * (min(ct_explicit.shape) - 1)))
print(f"\nChi2 = {chi2_exp:.4f}, p = {p_explicit:.6e}, dof = {dof_exp}")
print(f"Cramér's V = {cramers_v_explicit:.4f}")
print(f"Taxa explicit - Top: {top_explicit_yes/len(top):.4f} ({top_explicit_yes/len(top)*100:.2f}%)")
print(f"Taxa explicit - Bottom: {bot_explicit_yes/len(bottom):.4f} ({bot_explicit_yes/len(bottom)*100:.2f}%)\n")

# 7. Teste Chi-quadrado para 'mode' (Major/Minor)
print("="*100)
print("TESTE QUI-QUADRADO - MODE (Major/Minor)")
print("="*100)

# modo is string, values like 'Major' / 'Minor'
print(f"Valores únicos em 'modo': {df['modo'].unique()}")

top_major = int((top['modo'] == 'Maior').sum())
top_minor = int((top['modo'] == 'Menor').sum())
bot_major = int((bottom['modo'] == 'Maior').sum())
bot_minor = int((bottom['modo'] == 'Menor').sum())

ct_mode = np.array([
    [top_major, top_minor],
    [bot_major, bot_minor]
])
print("\nTabela de contingência (mode):")
print("               Major  Minor")
print(f"Top           {ct_mode[0,0]:>5}  {ct_mode[0,1]:>5}")
print(f"Bottom        {ct_mode[1,0]:>5}  {ct_mode[1,1]:>5}")

chi2_mode, p_mode, dof_mode, expected_mode = chi2_contingency(ct_mode)
n_total_mode = ct_mode.sum()
cramers_v_mode = np.sqrt(chi2_mode / (n_total_mode * (min(ct_mode.shape) - 1)))
print(f"\nChi2 = {chi2_mode:.4f}, p = {p_mode:.6e}, dof = {dof_mode}")
print(f"Cramér's V = {cramers_v_mode:.4f}")
print(f"Taxa Major - Top: {top_major/(top_major+top_minor):.4f} ({top_major/(top_major+top_minor)*100:.2f}%)")
print(f"Taxa Major - Bottom: {bot_major/(bot_major+bot_minor):.4f} ({bot_major/(bot_major+bot_minor)*100:.2f}%)\n")

# 8. Resumo de significância
print("="*100)
print("RESUMO DE SIGNIFICÂNCIA (p < 0.01 após FDR)")
print("="*100)

print("\n>>> DIFEREM significativamente (p_fdr < 0.01):")
diff = mw_df[mw_df['p_fdr'] < 0.01].sort_values('p_fdr')
for _, row in diff.iterrows():
    direction = "Top > Bottom" if row['rank_biserial_r'] < 0 else "Top < Bottom"
    print(f"  {row['feature']:<18}: p={row['p_fdr']:.3e}, r={row['rank_biserial_r']:+.4f} ({direction})")

print("\n>>> NÃO diferem significativamente (p_fdr >= 0.01) - PERFIL COMPARTILHADO:")
common = mw_df[mw_df['p_fdr'] >= 0.01].sort_values('p_fdr')
for _, row in common.iterrows():
    print(f"  {row['feature']:<18}: p={row['p_fdr']:.3e}, r={row['rank_biserial_r']:+.4f}")

print(f"\nChi-square explicit: p = {p_explicit:.3e}, Cramér's V = {cramers_v_explicit:.4f}")
if p_explicit < 0.01:
    print("  -> DIFEREM significativamente")
else:
    print("  -> NÃO diferem significativamente (perfil compartilhado)")

print(f"\nChi-square mode: p = {p_mode:.3e}, Cramér's V = {cramers_v_mode:.4f}")
if p_mode < 0.01:
    print("  -> DIFEREM significativamente")
else:
    print("  -> NÃO diferem significativamente (perfil compartilhado)")

# 9. Tabela final
print("\n" + "="*100)
print("TABELA FINAL DE COMPARAÇÃO")
print("="*100)
final_table = mw_df[['feature', 'top_mean', 'bottom_mean', 'rank_biserial_r', 'p_fdr', 'significant_001']].copy()
final_table['diferenca_abs'] = (final_table['top_mean'] - final_table['bottom_mean']).abs()
final_table = final_table.sort_values('p_fdr')
print(final_table.to_string(index=False))

# Save everything to a summary file
summary = {
    'p10': p10, 'p90': p90,
    'n_top': len(top), 'n_bottom': len(bottom),
    'mw_results': mw_df,
    'chi2_explicit': chi2_exp, 'p_explicit': p_explicit, 'cramers_v_explicit': cramers_v_explicit,
    'chi2_mode': chi2_mode, 'p_mode': p_mode, 'cramers_v_mode': cramers_v_mode,
    'top_explicit_rate': top_explicit_yes/len(top),
    'bot_explicit_rate': bot_explicit_yes/len(bottom),
    'top_major_rate': top_major/(top_major+top_minor),
    'bot_major_rate': bot_major/(bot_major+bot_minor),
    'desc_df': desc_df,
}
import json
print("\n\nRESUMO JSON-LIKE:")
for k, v in summary.items():
    if isinstance(v, pd.DataFrame):
        print(f"{k}: DataFrame")
    else:
        print(f"{k}: {v}")
