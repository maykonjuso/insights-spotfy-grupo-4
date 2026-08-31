"""
Q3 Analysis: Characteristics of the most popular artists.
"""
import os

import pandas as pd
import numpy as np
from scipy import stats
from statsmodels.stats.multitest import multipletests

PARQUET_PATH = r"C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\data\processed\spotify_tracks_limpo.parquet"
RESULTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resultados")

# 1. Load and prepare
df = pd.read_parquet(PARQUET_PATH)
print(f"Total tracks: {len(df):,}")
print(f"Unique artists (artista_principal): {df['artista_principal'].nunique():,}")

# 2. Aggregate at artist level
audio_features = [
    'danceability', 'energy', 'loudness', 'speechiness',
    'acousticness', 'instrumentalness', 'liveness', 'valence', 'tempo'
]

# Explicit rate (mean of bool = rate of True)
df['explicit_int'] = df['explicit'].astype(int)

artistas_agg = df.groupby('artista_principal').agg(
    n_tracks=('track_id', 'count'),
    mean_popularity=('popularity', 'mean'),
    median_popularity=('popularity', 'median'),
    explicit_rate=('explicit_int', 'mean'),
    n_generos_mean=('n_generos', 'mean'),
    n_artistas_mean=('n_artistas', 'mean'),
    danceability=('danceability', 'mean'),
    energy=('energy', 'mean'),
    loudness=('loudness', 'mean'),
    speechiness=('speechiness', 'mean'),
    acousticness=('acousticness', 'mean'),
    instrumentalness=('instrumentalness', 'mean'),
    liveness=('liveness', 'mean'),
    valence=('valence', 'mean'),
    tempo=('tempo', 'mean'),
).reset_index()

print(f"Total unique artists aggregated: {len(artistas_agg):,}")
print(f"Distribution of n_tracks per artist:")
print(artistas_agg['n_tracks'].describe())

# 3. Filter artists with >= 5 tracks
artistas_filtrado = artistas_agg[artistas_agg['n_tracks'] >= 5].copy()
print(f"\nArtists with >= 5 tracks: {len(artistas_filtrado):,}")

# 4. Define P90 and P10
p90 = artistas_filtrado['mean_popularity'].quantile(0.90)
p10 = artistas_filtrado['mean_popularity'].quantile(0.10)
print(f"P90 cutoff (mean popularity): {p90:.2f}")
print(f"P10 cutoff (mean popularity): {p10:.2f}")

top_p90 = artistas_filtrado[artistas_filtrado['mean_popularity'] >= p90].copy()
bottom_p10 = artistas_filtrado[artistas_filtrado['mean_popularity'] <= p10].copy()
print(f"Top 10% artists (P90): {len(top_p90):,}")
print(f"Bottom 10% artists (P10): {len(bottom_p10):,}")

# 5. Statistical tests: P90 vs P10
features_to_test = audio_features + ['explicit_rate', 'n_generos_mean', 'n_artistas_mean']

print("\n" + "="*80)
print("STATISTICAL TESTS: P90 vs P10 artists")
print("="*80)

results = []
for feat in features_to_test:
    p90_vals = top_p90[feat].dropna().values
    p10_vals = bottom_p10[feat].dropna().values

    if len(p90_vals) < 2 or len(p10_vals) < 2:
        continue

    # Check normality (Shapiro-Wilk on a sample if large)
    try:
        if len(p90_vals) <= 5000:
            _, p_shap_p90 = stats.shapiro(p90_vals)
        else:
            _, p_shap_p90 = stats.shapiro(p90_vals[:5000])
    except Exception:
        p_shap_p90 = 0
    try:
        if len(p10_vals) <= 5000:
            _, p_shap_p10 = stats.shapiro(p10_vals)
        else:
            _, p_shap_p10 = stats.shapiro(p10_vals[:5000])
    except Exception:
        p_shap_p10 = 0

    is_normal = (p_shap_p90 > 0.05) and (p_shap_p10 > 0.05)

    if is_normal:
        # t-test
        t_stat, p_val = stats.ttest_ind(p90_vals, p10_vals, equal_var=False)
        test_used = 't-test (Welch)'
    else:
        # Mann-Whitney U
        u_stat, p_val = stats.mannwhitneyu(p90_vals, p10_vals, alternative='two-sided')
        t_stat = u_stat
        test_used = 'Mann-Whitney U'

    # Effect size
    if is_normal:
        # Cohen's d
        n1, n2 = len(p90_vals), len(p10_vals)
        s1, s2 = p90_vals.std(ddof=1), p10_vals.std(ddof=1)
        pooled_sd = np.sqrt(((n1-1)*s1**2 + (n2-1)*s2**2) / (n1+n2-2))
        if pooled_sd > 0:
            cohen_d = (p90_vals.mean() - p10_vals.mean()) / pooled_sd
        else:
            cohen_d = 0
        effect = cohen_d
        effect_type = "Cohen's d"
    else:
        # Rank-biserial correlation
        n1, n2 = len(p90_vals), len(p10_vals)
        rb = 1 - (2*t_stat) / (n1*n2)
        effect = rb
        effect_type = "Rank-biserial"

    results.append({
        'feature': feat,
        'test': test_used,
        'p90_mean': p90_vals.mean(),
        'p10_mean': p10_vals.mean(),
        'p90_median': np.median(p90_vals),
        'p10_median': np.median(p10_vals),
        'p90_n': len(p90_vals),
        'p10_n': len(p10_vals),
        'test_stat': t_stat,
        'p_value': p_val,
        'effect_size': effect,
        'effect_type': effect_type,
        'is_normal': is_normal
    })

results_df = pd.DataFrame(results)

# FDR correction (Benjamini-Hochberg)
reject, pvals_corrected, _, _ = multipletests(results_df['p_value'], alpha=0.01, method='fdr_bh')
results_df['p_value_fdr'] = pvals_corrected
results_df['significant_fdr_01'] = reject
# Also uncorrected p < 0.01
results_df['significant_uncorr_01'] = results_df['p_value'] < 0.01

# Show all results
print("\nAll results:")
pd.set_option('display.max_columns', None)
pd.set_option('display.width', 200)
pd.set_option('display.float_format', '{:.4g}'.format)
print(results_df[['feature', 'test', 'p90_mean', 'p10_mean', 'p_value', 'p_value_fdr', 'effect_size', 'effect_type', 'significant_fdr_01']].to_string(index=False))

# Only significant (FDR-corrected p < 0.01)
sig = results_df[results_df['significant_fdr_01']].copy()
print(f"\n\nSignificant differences (FDR-corrected p < 0.01): {len(sig)}")
print(sig[['feature', 'p90_mean', 'p10_mean', 'p_value_fdr', 'effect_size', 'effect_type']].to_string(index=False))

# 6. Top 5 genres in P90 vs P10 (with chi-square)
print("\n" + "="*80)
print("TOP 5 GENRES: P90 vs P10")
print("="*80)

# Get tracks from top and bottom artists
top_artists_set = set(top_p90['artista_principal'])
bottom_artists_set = set(bottom_p10['artista_principal'])

df_top_tracks = df[df['artista_principal'].isin(top_artists_set)]
df_bot_tracks = df[df['artista_principal'].isin(bottom_artists_set)]

# Get top 5 genres for each
top_genres_counts = df_top_tracks['genero_principal'].value_counts()
bot_genres_counts = df_bot_tracks['genero_principal'].value_counts()

print("\nTop 5 genero_principal in P90:")
print(top_genres_counts.head(10))
print("\nTop 5 genero_principal in P10:")
print(bot_genres_counts.head(10))

# For chi-square: build a contingency table with top 5 of each (union)
top5_top = set(top_genres_counts.head(5).index)
top5_bot = set(bot_genres_counts.head(5).index)
union_genres = list(top5_top | top5_bot)

# Contingency: rows = genre, cols = (count_in_p90, count_in_p10)
contingency = []
for g in union_genres:
    c_top = (df_top_tracks['genero_principal'] == g).sum()
    c_bot = (df_bot_tracks['genero_principal'] == g).sum()
    contingency.append([c_top, c_bot])

contingency = np.array(contingency)
print(f"\nContingency table (rows={union_genres}):")
print("Genre | P90 | P10")
for i, g in enumerate(union_genres):
    print(f"  {g}: {contingency[i][0]} | {contingency[i][1]}")

chi2, p_chi, dof, expected = stats.chi2_contingency(contingency)
print(f"\nChi-square: chi2={chi2:.4f}, dof={dof}, p={p_chi:.6e}")
print(f"Expected frequencies: min={expected.min():.2f}, any<5: {(expected<5).any()}")

# 7. Save results
results_df.to_csv(os.path.join(RESULTS, 'q3_results_full.csv'), index=False)
sig.to_csv(os.path.join(RESULTS, 'q3_results_significant.csv'), index=False)

# Save full top/bottom artist lists (with summary) for the report
top_p90_sorted = top_p90.sort_values('mean_popularity', ascending=False)
bot_p10_sorted = bottom_p10.sort_values('mean_popularity', ascending=True)
top_p90_sorted.to_csv(os.path.join(RESULTS, 'q3_top10pct_artists.csv'), index=False)
bot_p10_sorted.to_csv(os.path.join(RESULTS, 'q3_bottom10pct_artists.csv'), index=False)

# 8. Summary stats for the report
print("\n" + "="*80)
print("SUMMARY FOR REPORT")
print("="*80)
print(f"Total tracks: {len(df):,}")
print(f"Total unique artists: {df['artista_principal'].nunique():,}")
print(f"Artists with >=5 tracks: {len(artistas_filtrado):,}")
print(f"P90 cutoff (mean popularity): {p90:.2f}")
print(f"P10 cutoff (mean popularity): {p10:.2f}")
print(f"N P90 artists: {len(top_p90)}")
print(f"N P10 artists: {len(bottom_p10)}")
print(f"Mean tracks per P90 artist: {top_p90['n_tracks'].mean():.2f}")
print(f"Mean tracks per P10 artist: {bottom_p10['n_tracks'].mean():.2f}")

# Show top 10 of each
print("\nTop 10 P90 artists (most popular):")
print(top_p90_sorted[['artista_principal', 'n_tracks', 'mean_popularity']].head(10).to_string(index=False))
print("\nTop 10 P10 artists (least popular):")
print(bot_p10_sorted[['artista_principal', 'n_tracks', 'mean_popularity']].head(10).to_string(index=False))
