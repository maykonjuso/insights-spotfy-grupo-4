"""
Q6 Analysis: Why do some artists have the same audio features as famous artists
but are not famous themselves?
"""
import pandas as pd
import numpy as np
from scipy.stats import mannwhitneyu, chi2_contingency
from statsmodels.stats.multitest import multipletests
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
import warnings
warnings.filterwarnings('ignore')

PATH = r"C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\data\processed\spotify_tracks_limpo.parquet"
df = pd.read_parquet(PATH)

print("="*80)
print("Q6 — POR QUE ARTISTAS COM MESMAS FEATURES DE AUDIO NAO SAO FAMOSOS?")
print("="*80)
print(f"Total de faixas: {len(df):,}")
print(f"Total de artistas unicos: {df['artista_principal'].nunique():,}")
print()

# ============================================================
# 1. AGREGAR POR ARTISTA (>= 5 FAIXAS)
# ============================================================
audio_features = ['danceability', 'energy', 'loudness', 'speechiness',
                  'acousticness', 'instrumentalness', 'liveness', 'valence', 'tempo']

# Filter artists with >= 5 tracks
track_counts = df['artista_principal'].value_counts()
eligible_artists = track_counts[track_counts >= 5].index
df_eligible = df[df['artista_principal'].isin(eligible_artists)].copy()
print(f"Artistas com >= 5 faixas: {len(eligible_artists):,}")
print(f"Faixas correspondentes: {len(df_eligible):,} ({len(df_eligible)/len(df)*100:.1f}% do total)")
print()

# Aggregate at artist level
artist_agg = df_eligible.groupby('artista_principal').agg(
    n_tracks=('track_id', 'count'),
    mean_pop=('popularity', 'mean'),
    n_generos=('n_generos', 'mean'),
    n_artistas=('n_artistas', 'mean'),
    explicit_rate=('explicit', 'mean'),
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

# Build per-artist genre distribution (multi-label): we count presence of each genre
# Use the long table for per-artist genre set
print("Construindo perfil de generos por artista...")
# Aggregated unique genres per artist (use a set of (artist, genero_principal))
genre_per_artist = (df_eligible.groupby('artista_principal')['genero_principal']
                    .apply(lambda s: set(s.dropna().unique()))
                    .to_dict())

# Most common genre for each artist (mode)
def mode_genre(s):
    s = s.dropna()
    if len(s) == 0:
        return None
    return s.value_counts().index[0]
artist_mode_genre = df_eligible.groupby('artista_principal')['genero_principal'].apply(mode_genre)
artist_agg['genero_dominante'] = artist_agg['artista_principal'].map(artist_mode_genre)

print(f"Artistas apos agregacao: {len(artist_agg):,}")
print(f"Colunas finais: {list(artist_agg.columns)}")
print()

# ============================================================
# 2. CLUSTERING POR PERFIL DE FEATURES DE AUDIO
# ============================================================
print("="*80)
print("CLUSTERING K-MEANS")
print("="*80)

X_audio = artist_agg[audio_features].values
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_audio)

# Choose k with silhouette analysis
sil_scores = {}
for k in range(5, 11):
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = km.fit_predict(X_scaled)
    sil = silhouette_score(X_scaled, labels)
    sil_scores[k] = sil
    print(f"  k={k}: silhouette={sil:.4f}")

# Pick best k
best_k = max(sil_scores, key=sil_scores.get)
print(f"\nMelhor k (silhouette): {best_k} (score={sil_scores[best_k]:.4f})")

# Use k=5 to be conservative and interpretable; also report best
USE_K = 5  # minimum in the range, simpler
print(f"Usando k={USE_K} para a analise abaixo (perfil mais interpretavel).")

km = KMeans(n_clusters=USE_K, random_state=42, n_init=10)
artist_agg['cluster'] = km.fit_predict(X_scaled)

# Cluster sizes
print("\nTamanho dos clusters:")
cluster_sizes = artist_agg['cluster'].value_counts().sort_index()
for c, n in cluster_sizes.items():
    print(f"  Cluster {c}: {n} artistas ({n/len(artist_agg)*100:.1f}%)")

# Cluster centroids (means of audio features)
print("\nCentroides (medias) de features de audio por cluster:")
centroids = artist_agg.groupby('cluster')[audio_features].mean()
print(centroids.round(3).to_string())

# ============================================================
# 3. DENTRO DE CADA CLUSTER: TOP 25% vs BOTTOM 25% POR POPULARIDADE
# ============================================================
print()
print("="*80)
print("COMPARACAO TOP 25% vs BOTTOM 25% POR CLUSTER")
print("="*80)

# Metrics to compare
numeric_metrics = ['n_generos', 'n_artistas', 'explicit_rate', 'n_tracks']
categorical_metric = 'genero_dominante'

# Track all p-values for FDR
all_pvalues = []
all_records = []  # for later reporting

results_by_cluster = {}

for c in sorted(artist_agg['cluster'].unique()):
    sub = artist_agg[artist_agg['cluster'] == c].copy()
    n_c = len(sub)
    if n_c < 8:
        print(f"\nCluster {c} muito pequeno (n={n_c}); pulando.")
        continue

    q25 = sub['mean_pop'].quantile(0.25)
    q75 = sub['mean_pop'].quantile(0.75)
    pop = sub[sub['mean_pop'] >= q75].copy()
    unpop = sub[sub['mean_pop'] <= q25].copy()

    pop['grupo'] = 'popular_top25'
    unpop['grupo'] = 'unpopular_bot25'

    print(f"\n--- Cluster {c} (n={n_c}) ---")
    print(f"  Q25 popularidade = {q25:.2f}, Q75 = {q75:.2f}")
    print(f"  Top 25%: {len(pop)} artistas | Bottom 25%: {len(unpop)} artistas")
    print(f"  Pop media (top): {pop['mean_pop'].mean():.2f} +/- {pop['mean_pop'].std():.2f}")
    print(f"  Pop media (bot): {unpop['mean_pop'].mean():.2f} +/- {unpop['mean_pop'].std():.2f}")

    cluster_tests = {'cluster': int(c), 'n_total': n_c,
                     'n_top': len(pop), 'n_bot': len(unpop),
                     'pop_mean_top': float(pop['mean_pop'].mean()),
                     'pop_mean_bot': float(unpop['mean_pop'].mean()),
                     'tests': []}

    # Mann-Whitney U for numeric metrics
    for m in numeric_metrics:
        try:
            stat, p = mannwhitneyu(pop[m].dropna(), unpop[m].dropna(),
                                    alternative='two-sided')
            cluster_tests['tests'].append({
                'metric': m, 'test': 'mannwhitneyu',
                'U': float(stat), 'p': float(p),
                'mean_top': float(pop[m].mean()),
                'mean_bot': float(unpop[m].mean()),
                'median_top': float(pop[m].median()),
                'median_bot': float(unpop[m].median()),
            })
            all_pvalues.append(p)
        except Exception as e:
            print(f"  ! erro em {m}: {e}")

    # Chi-square for genre distribution
    try:
        # Build contingency table
        all_genres = pd.concat([pop[categorical_metric], unpop[categorical_metric]]).dropna()
        top_genres = pop[categorical_metric].value_counts()
        bot_genres = unpop[categorical_metric].value_counts()
        all_idx = sorted(set(top_genres.index).union(set(bot_genres.index)))
        ct = pd.DataFrame(index=all_idx)
        ct['top'] = top_genres
        ct['bot'] = bot_genres
        ct = ct.fillna(0)
        # Restrict to genres that appear in at least 1 in either group to avoid sparse zeros
        ct = ct[(ct['top'] + ct['bot']) >= 1]
        if ct.shape[0] >= 2:
            chi2, p, dof, exp = chi2_contingency(ct.values)
            # Effect: top-3 genres by lift
            top_total = ct['top'].sum()
            bot_total = ct['bot'].sum()
            ct['pct_top'] = ct['top'] / top_total if top_total else 0
            ct['pct_bot'] = ct['bot'] / bot_total if bot_total else 0
            ct['lift'] = (ct['pct_top'] / ct['pct_bot']).replace([np.inf, -np.inf], np.nan)
            top3 = ct.sort_values('lift', ascending=False).head(5)
            cluster_tests['tests'].append({
                'metric': 'genero_dominante', 'test': 'chi2',
                'chi2': float(chi2), 'dof': int(dof), 'p': float(p),
                'top3_lift_genres': top3[['top', 'bot', 'pct_top', 'pct_bot', 'lift']].to_dict('index'),
                'n_categories': int(ct.shape[0]),
            })
            all_pvalues.append(p)
        else:
            cluster_tests['tests'].append({
                'metric': 'genero_dominante', 'test': 'chi2',
                'note': 'categorias insuficientes',
            })
    except Exception as e:
        print(f"  ! erro em chi2: {e}")

    results_by_cluster[int(c)] = cluster_tests

# ============================================================
# 4. FDR CORRECTION
# ============================================================
print()
print("="*80)
print("CORRECAO FDR (Benjamini-Hochberg)")
print("="*80)

if all_pvalues:
    reject, pvals_corrected, _, _ = multipletests(all_pvalues, alpha=0.01, method='fdr_bh')
    # Map corrected p back into each cluster result
    idx = 0
    for c, res in results_by_cluster.items():
        for t in res['tests']:
            if 'p' in t:
                t['p_fdr'] = float(pvals_corrected[idx])
                t['sig_fdr_0.01'] = bool(reject[idx])
                idx += 1
    print(f"Total de testes com p-value: {idx}")
    print(f"Significativos (FDR < 0.01): {int(sum(reject))} de {idx}")
else:
    print("Nenhum p-value computado.")

# ============================================================
# 5. RELATORIO DETALHADO
# ============================================================
print()
print("="*80)
print("RELATORIO DETALHADO POR CLUSTER (somente significativos p<0.01)")
print("="*80)

for c, res in results_by_cluster.items():
    print(f"\n############ CLUSTER {c} (n={res['n_total']}) ############")
    print(f"  Q25={res.get('q25','?')}, Q75={res.get('q75','?')}")
    print(f"  Top 25% n={res['n_top']} | Bot 25% n={res['n_bot']}")
    print(f"  Pop media: top={res['pop_mean_top']:.2f}, bot={res['pop_mean_bot']:.2f}")
    sig_tests = [t for t in res['tests'] if t.get('sig_fdr_0.01')]
    if not sig_tests:
        print("  Nenhuma diferenca estatisticamente significativa (FDR<0.01).")
    for t in sig_tests:
        if t['test'] == 'mannwhitneyu':
            print(f"  * {t['metric']}: p={t['p']:.2e} p_fdr={t['p_fdr']:.2e} | "
                  f"top median={t['median_top']:.3f}, bot median={t['median_bot']:.3f}, "
                  f"diff_abs={t['mean_top']-t['mean_bot']:+.3f}")
        elif t['test'] == 'chi2':
            print(f"  * genero_dominante: chi2={t['chi2']:.2f}, dof={t['dof']}, "
                  f"p={t['p']:.2e}, p_fdr={t['p_fdr']:.2e}")
            for g, row in t.get('top3_lift_genres', {}).items():
                if not np.isnan(row['lift']):
                    print(f"      {g}: top={int(row['top'])} ({row['pct_top']*100:.1f}%), "
                          f"bot={int(row['bot'])} ({row['pct_bot']*100:.1f}%), "
                          f"lift={row['lift']:+.2f}x")

# ============================================================
# 6. SUMMARY
# ============================================================
print()
print("="*80)
print("RESUMO DE FATORES NAO-AUDIO QUE SEPARAM POPULARES DE IMPOPULARES")
print("="*80)

sig_summary = {}
for c, res in results_by_cluster.items():
    for t in res['tests']:
        if t.get('sig_fdr_0.01'):
            key = t['metric']
            if key not in sig_summary:
                sig_summary[key] = []
            sig_summary[key].append({'cluster': c, **t})

for k, v in sig_summary.items():
    print(f"\n{k}: significativo em {len(v)} cluster(s)")
    for x in v:
        if x['test'] == 'mannwhitneyu':
            print(f"  cluster {x['cluster']}: top med={x['median_top']:.3f} vs bot med={x['median_bot']:.3f} "
                  f"(p_fdr={x['p_fdr']:.2e})")
        else:
            print(f"  cluster {x['cluster']}: chi2 p_fdr={x['p_fdr']:.2e}")

# Save for next step
import json
with open(r"C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\analysis_q6_results.json", "w") as f:
    # Convert numpy types
    def conv(o):
        if isinstance(o, (np.integer,)): return int(o)
        if isinstance(o, (np.floating,)): return float(o)
        if isinstance(o, (np.ndarray,)): return o.tolist()
        if isinstance(o, (np.bool_,)): return bool(o)
        if isinstance(o, dict): return {k: conv(v) for k, v in o.items()}
        if isinstance(o, list): return [conv(v) for v in o]
        return o
    json.dump({
        'silhouette_scores': sil_scores,
        'best_k_silhouette': best_k,
        'used_k': USE_K,
        'cluster_sizes': {int(k): int(v) for k, v in cluster_sizes.items()},
        'centroids': centroids.to_dict(),
        'cluster_results': conv(results_by_cluster),
    }, f, indent=2, default=str)

print("\nResultados salvos em analysis_q6_results.json")
