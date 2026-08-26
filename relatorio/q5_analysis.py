"""
Q5: O público consome mais música positiva/alegre ou melancólica/triste?
Análise de correlação, regressão logística e comparação de grupos.
"""
import pandas as pd
import numpy as np
from scipy import stats
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
import warnings
warnings.filterwarnings('ignore')

# Load data
PATH = r"C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\data\processed\spotify_tracks_limpo.parquet"
df = pd.read_parquet(PATH)

print("=" * 80)
print("VISÃO GERAL DOS DADOS")
print("=" * 80)
print(f"Linhas totais: {len(df):,}")
print(f"Colunas: {df.columns.tolist()}")
print()

for c in ['valence', 'popularity', 'energy', 'danceability', 'acousticness', 'speechiness']:
    if c in df.columns:
        print(f"{c}: min={df[c].min():.4f}, max={df[c].max():.4f}, "
              f"mean={df[c].mean():.4f}, nulos={df[c].isna().sum()}")
    else:
        print(f"COLUNA AUSENTE: {c}")
print()

# Dropna nas colunas-chave
cols = ['valence', 'popularity', 'energy', 'danceability', 'acousticness', 'speechiness']
df_clean = df.dropna(subset=cols).copy()
print(f"Linhas após dropna em {cols}: {len(df_clean):,}")
print()

# ============================
# 1. CORRELAÇÕES
# ============================
print("=" * 80)
print("1) CORRELAÇÕES: valence x popularity")
print("=" * 80)
v = df_clean['valence']
p = df_clean['popularity']

r_pearson, p_pearson = stats.pearsonr(v, p)
rho_spearman, p_spearman = stats.spearmanr(v, p)

print(f"Pearson  : r = {r_pearson:.6f}, p-valor = {p_pearson:.3e}")
print(f"Spearman : rho = {rho_spearman:.6f}, p-valor = {p_spearman:.3e}")
print(f"Significativo (p<0.01)? Pearson: {'SIM' if p_pearson < 0.01 else 'NÃO'}; "
      f"Spearman: {'SIM' if p_spearman < 0.01 else 'NÃO'}")
print()

# ============================
# 2. QUARTIS DE VALENCE
# ============================
print("=" * 80)
print("2) QUARTIS DE VALENCE — popularidade por quartil")
print("=" * 80)
df_clean['valence_q'] = pd.qcut(df_clean['valence'], q=4, labels=False, duplicates='drop')
quartile_labels = {0: 'Q1 (mais triste)', 1: 'Q2', 2: 'Q3', 3: 'Q4 (mais feliz)'}
cats = pd.qcut(df_clean['valence'], q=4, duplicates='drop').cat.categories
print(f"Limites dos quartis (boundaries): {[str(c) for c in cats]}")
print()

def mean_ci_95(values):
    n = len(values)
    m = values.mean()
    se = values.std(ddof=1) / np.sqrt(n)
    t_crit = stats.t.ppf(0.975, df=n-1)
    return m, m - t_crit*se, m + t_crit*se

print(f"{'Quartil':<22}{'n':>10}{'media_pop':>12}{'IC95_inf':>12}{'IC95_sup':>12}{'mediana':>10}")
for q in sorted(df_clean['valence_q'].unique()):
    sub = df_clean[df_clean['valence_q'] == q]['popularity']
    m, lo, hi = mean_ci_95(sub)
    med = sub.median()
    label = quartile_labels.get(q, f"Q{q+1}")
    print(f"{label:<22}{len(sub):>10}{m:>12.4f}{lo:>12.4f}{hi:>12.4f}{med:>10.4f}")
print()

# ============================
# 5. CONTAGENS E PROPORÇÕES
# ============================
print("=" * 80)
print("5) CONTAGENS E PROPORÇÕES POR QUARTIL DE VALENCE")
print("=" * 80)
total = len(df_clean)
counts = df_clean['valence_q'].value_counts().sort_index()
for q in counts.index:
    n = counts[q]
    prop = n / total
    label = quartile_labels.get(q, f"Q{q+1}")
    print(f"Q{q+1}: n={n:,}  proporcao={prop:.4f}  ({label})")
print(f"TOTAL: {total:,}")
print()

# ============================
# 3. ALTA VALENCE vs BAIXA VALENCE
# ============================
print("=" * 80)
print("3) ALTA VALENCE (>=0.6) vs BAIXA VALENCE (<=0.4)")
print("=" * 80)
high = df_clean[df_clean['valence'] >= 0.6]['popularity']
low = df_clean[df_clean['valence'] <= 0.4]['popularity']

print(f"Alta valence (>=0.6):  n={len(high):,}, media={high.mean():.4f}, mediana={high.median():.4f}, dp={high.std(ddof=1):.4f}")
print(f"Baixa valence (<=0.4): n={len(low):,}, media={low.mean():.4f}, mediana={low.median():.4f}, dp={low.std(ddof=1):.4f}")

u_stat, p_mw = stats.mannwhitneyu(high, low, alternative='two-sided')
n1, n2 = len(high), len(low)
r_rb = 1 - (2 * u_stat) / (n1 * n2)

# Cohen's d
d_cohen = (high.mean() - low.mean()) / np.sqrt(((n1-1)*high.std(ddof=1)**2 + (n2-1)*low.std(ddof=1)**2) / (n1+n2-2))

print(f"\nMann-Whitney U: U = {u_stat:.2f}, p-valor = {p_mw:.3e}")
print(f"Rank-biserial r = {r_rb:.6f}")
print(f"Cohen's d       = {d_cohen:.6f}")
print(f"Significativo (p<0.01)? {'SIM' if p_mw < 0.01 else 'NÃO'}")
print()

# ============================
# 4. REGRESSÃO LOGÍSTICA (sklearn)
# ============================
print("=" * 80)
print("4) REGRESSÃO LOGÍSTICA: popularidade alta (top 25%) ~ preditores")
print("=" * 80)
thr = df_clean['popularity'].quantile(0.75)
df_clean['pop_high'] = (df_clean['popularity'] >= thr).astype(int)
print(f"Threshold top 25% popularidade: {thr}")
print(f"Prevalência da classe positiva: {df_clean['pop_high'].mean():.4f}")

X_cols = ['valence', 'energy', 'danceability', 'acousticness', 'speechiness']
X = df_clean[X_cols].values
y = df_clean['pop_high'].values

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Use solver com max_iter alto e método newton-cg
clf = LogisticRegression(max_iter=2000, solver='lbfgs', C=1e6, penalty='l2')
clf.fit(X_scaled, y)

# Calcular p-valores por aproximação (Wald z) e odds ratio
from sklearn.utils import resample
from scipy.special import expit
import math

# Wald test
coefs = clf.coef_[0]
intercept = clf.intercept_[0]
X_design = np.hstack([np.ones((X_scaled.shape[0], 1)), X_scaled])
pred = expit(X_design @ np.concatenate([[intercept], coefs]))
W = pred * (1 - pred)
# Cov matrix approx
XtWX = (X_design.T * W) @ X_design
try:
    cov = np.linalg.inv(XtWX)
    se = np.sqrt(np.diag(cov))
    z = np.concatenate([[intercept], coefs]) / se
    p_vals = 2 * (1 - stats.norm.cdf(np.abs(z)))
except np.linalg.LinAlgError:
    se = np.full(len(coefs) + 1, np.nan)
    z = np.full(len(coefs) + 1, np.nan)
    p_vals = np.full(len(coefs) + 1, np.nan)

print("\nCoeficientes (padronizados) e p-valores (Wald):")
all_names = ['const'] + X_cols
for name, b, pv in zip(all_names, np.concatenate([[intercept], coefs]), p_vals):
    sig = "**" if (not np.isnan(pv) and pv < 0.01) else "ns"
    print(f"  {name:<14}: coef={b:>10.6f}  p={pv:.3e}  {sig}")

# Odds ratios
print("\nOdds Ratios (exp(coef)) para variáveis padronizadas (efeito de 1 DP):")
for name, b in zip(X_cols, coefs):
    print(f"  {name:<14}: OR = {math.exp(b):.6f}")

# Acurácia simples
acc = clf.score(X_scaled, y)
print(f"\nAcurácia no treino: {acc:.4f}")
print()

# ============================
# RESUMO ESTRUTURADO
# ============================
print("=" * 80)
print("RESUMO PARA O RELATÓRIO")
print("=" * 80)
print(f"n_total = {len(df_clean)}")
print(f"pearson_r = {r_pearson:.6f}, pearson_p = {p_pearson:.3e}")
print(f"spearman_rho = {rho_spearman:.6f}, spearman_p = {p_spearman:.3e}")
print(f"mw_U = {u_stat:.2f}, mw_p = {p_mw:.3e}")
print(f"rank_biserial = {r_rb:.6f}, cohens_d = {d_cohen:.6f}")
print(f"threshold_top25 = {thr}")
print(f"logit_coefs (const+vars) = {dict(zip(all_names, np.concatenate([[intercept], coefs])))}")
print(f"logit_pvalues = {dict(zip(all_names, p_vals))}")
for q in counts.index:
    print(f"  Q{q+1}: n={int(counts[q])}, prop={counts[q]/total:.4f}")
