"""
Q2 Analysis: Which music genres have the highest popularity?
"""
import pandas as pd
import numpy as np
from scipy import stats

# Load data
PATH = r"C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\data\processed\spotify_tracks_limpo.parquet"
df = pd.read_parquet(PATH)

print(f"Total tracks: {len(df):,}")
print(f"Unique genres: {df['genero_principal'].nunique()}")
print(f"Overall popularity: mean={df['popularity'].mean():.2f}, median={df['popularity'].median():.2f}, std={df['popularity'].std():.2f}")
print()

# Step 1: Compute stats by genre (filter n >= 100)
genre_stats = (
    df.groupby('genero_principal')['popularity']
      .agg(['count', 'mean', 'median', 'std'])
      .rename(columns={'count': 'n', 'mean': 'mean_pop', 'median': 'median_pop', 'std': 'std_pop'})
)
genre_stats = genre_stats[genre_stats['n'] >= 100].copy()

# 95% CI using t-distribution (1.96 * SE as approximation; using t for n>=100 since large)
def ci95(x):
    n = len(x)
    se = stats.sem(x)
    h = se * stats.t.ppf(0.975, n - 1)
    return h

# Use a vectorized approach via groupby
def compute_ci(group):
    n = len(group)
    se = stats.sem(group)
    h = se * stats.t.ppf(0.975, n - 1)
    return pd.Series({'ci95': h, 'n': n})

# Build the per-genre CI using groupby apply
ci_series = df.groupby('genero_principal')['popularity'].apply(ci95)
genre_stats['ci95'] = ci_series
genre_stats = genre_stats[genre_stats['n'] >= 100].copy()
genre_stats['lower'] = genre_stats['mean_pop'] - genre_stats['ci95']
genre_stats['upper'] = genre_stats['mean_pop'] + genre_stats['ci95']

# Global median
global_median = df['popularity'].median()
print(f"Global median popularity: {global_median}")
print()

# Step 2: Top 10 by mean popularity
top10 = genre_stats.sort_values('mean_pop', ascending=False).head(10)
print("Top 10 genres by mean popularity (n >= 100):")
print(top10[['n', 'mean_pop', 'median_pop', 'std_pop', 'ci95', 'lower', 'upper']].round(3))
print()

# Step 3: Kruskal-Wallis H test across all genres (with n >= 100)
genres_for_kw = genre_stats.index.tolist()
groups = [df.loc[df['genero_principal'] == g, 'popularity'].values for g in genres_for_kw]
H, p_kw = stats.kruskal(*groups)
print(f"Kruskal-Wallis H = {H:.2f}, p = {p_kw:.4e}")
print()

# Step 4: Pairwise Mann-Whitney U for top 10 vs global median, FDR correction
global_median_value = df['popularity'].median()
mw_results = []
for genre in top10.index:
    sample = df.loc[df['genero_principal'] == genre, 'popularity'].values
    # Mann-Whitney U vs global median: not a standard test since global is single value.
    # Better: compare each top genre's distribution vs the distribution of all OTHER tracks (i.e., excluding the genre)
    rest = df.loc[df['genero_principal'] != genre, 'popularity'].values
    u, p = stats.mannwhitneyu(sample, rest, alternative='two-sided')
    mw_results.append({'genre': genre, 'n': len(sample), 'mean': sample.mean(), 'median': np.median(sample), 'U': u, 'p': p})

mw_df = pd.DataFrame(mw_results)

# FDR correction (Benjamini-Hochberg)
from scipy.stats import false_discovery_control
# Manual BH
pvals = mw_df['p'].values
m = len(pvals)
order = np.argsort(pvals)
ranked = pvals[order]
adj = np.empty(m)
cum_min = 1.0
for i in range(m - 1, -1, -1):
    val = ranked[i] * m / (i + 1)
    cum_min = min(cum_min, val)
    adj[i] = cum_min
adj_pvals = np.empty(m)
adj_pvals[order] = adj
mw_df['p_fdr'] = adj_pvals
mw_df['sig_p<0.01'] = mw_df['p_fdr'] < 0.01

print("Mann-Whitney U pairwise: Top 10 vs Rest of dataset (FDR corrected, p<0.01)")
print(mw_df.round(6).to_string(index=False))
print()

# Step 5: Check CI overlap with global median
top10_full = top10.copy()
top10_full['ci_contains_global_median'] = (top10_full['lower'] <= global_median) & (top10_full['upper'] >= global_median)
print("CI vs global median (median=33):")
print(top10_full[['mean_pop', 'lower', 'upper', 'ci_contains_global_median']].round(3))
print()

# Final report data
print("=" * 80)
print("FINAL DATA FOR REPORT")
print("=" * 80)
result = top10.merge(mw_df[['genre', 'p', 'p_fdr', 'sig_p<0.01']], left_index=True, right_on='genre')
print(result[['genre', 'n', 'mean_pop', 'median_pop', 'std_pop', 'ci95', 'lower', 'upper', 'p_fdr', 'sig_p<0.01']].round(4).to_string(index=False))
