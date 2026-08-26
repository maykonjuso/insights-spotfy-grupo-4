"""
Q6 Analysis (final) — Why do some artists have the same audio features as famous
artists but are not famous themselves?
"""
import pandas as pd
import numpy as np
import json
import math
from scipy.stats import mannwhitneyu, chi2_contingency
from statsmodels.stats.multitest import multipletests
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
import warnings
warnings.filterwarnings('ignore')

PATH = r"C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\data\processed\spotify_tracks_limpo.parquet"
df = pd.read_parquet(PATH)

print("=" * 80)
print("Q6 - POR QUE ARTISTAS COM MESMAS FEATURES DE AUDIO NAO SAO FAMOSOS?")
print("=" * 80)
print(f"Total de faixas: {len(df):,}")
print(f"Total de artistas unicos: {df['artista_principal'].nunique():,}")
print()

# 1. AGREGAR POR ARTISTA (>= 5 FAIXAS)
audio_features = ['danceability', 'energy', 'loudness', 'speechiness',
                  'acousticness', 'instrumentalness', 'liveness', 'valence', 'tempo']

track_counts = df['artista_principal'].value_counts()
eligible_artists = track_counts[track_counts >= 5].index
df_elig = df[df['artista_principal'].isin(eligible_artists)].copy()
print(f"Artistas com >= 5 faixas: {len(eligible_artists):,}")
print(f"Faixas correspondentes: {len(df_elig):,} ({len(df_elig)/len(df)*100:.1f}% do total)")

artist_agg = df_elig.groupby('artista_principal').agg(
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

def mode_genre(s):
    s = s.dropna()
    if len(s) == 0:
        return None
    return s.value_counts().index[0]

artist_mode_genre = df_elig.groupby('artista_principal')['genero_principal'].apply(mode_genre)
artist_agg['genero_dominante'] = artist_agg['artista_principal'].map(artist_mode_genre)
print(f"Artistas apos agregacao: {len(artist_agg):,}")
print()

# 2. CLUSTERING
print("=" * 80)
print("CLUSTERING K-MEANS (k=5..10)")
print("=" * 80)
X_audio = artist_agg[audio_features].fillna(artist_agg[audio_features].mean()).values
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_audio)

sil_scores = {}
for k in range(5, 11):
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = km.fit_predict(X_scaled)
    sil = silhouette_score(X_scaled, labels)
    sil_scores[k] = sil
    print(f"  k={k}: silhouette = {sil:.4f}")

best_k = max(sil_scores, key=sil_scores.get)
print(f"\nMelhor k (silhouette): {best_k} (score={sil_scores[best_k]:.4f})")

USE_K = 5
print(f"Usando k={USE_K} para a analise abaixo (consistente com requisito minimo).")
km = KMeans(n_clusters=USE_K, random_state=42, n_init=10)
artist_agg['cluster'] = km.fit_predict(X_scaled)

cluster_sizes = artist_agg['cluster'].value_counts().sort_index()
print("\nTamanho dos clusters:")
for c, n in cluster_sizes.items():
    print(f"  Cluster {c}: {n} artistas ({n/len(artist_agg)*100:.1f}%)")

centroids = artist_agg.groupby('cluster')[audio_features].mean()
print("\nCentroides (medias) de features de audio por cluster:")
print(centroids.round(3).to_string())

# 3. DENTRO DE CADA CLUSTER: TOP 25% vs BOTTOM 25%
print()
print("=" * 80)
print("COMPARACAO TOP 25% vs BOTTOM 25% POR CLUSTER")
print("=" * 80)

numeric_metrics = ['n_generos', 'n_artistas', 'explicit_rate', 'n_tracks']
results_by_cluster = {}
all_valid_pvalues = []  # only valid (non-NaN) p-values for FDR
test_index_map = []     # (cluster, test_index) for each valid p

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

    print(f"\n--- Cluster {c} (n={n_c}) ---")
    print(f"  Q25 popularidade = {q25:.2f}, Q75 = {q75:.2f}")
    print(f"  Top 25%: {len(pop)} artistas | Bottom 25%: {len(unpop)} artistas")
    print(f"  Pop media (top): {pop['mean_pop'].mean():.2f} +/- {pop['mean_pop'].std():.2f}")
    print(f"  Pop media (bot): {unpop['mean_pop'].mean():.2f} +/- {unpop['mean_pop'].std():.2f}")

    cluster_tests = {
        'cluster': int(c), 'n_total': n_c,
        'n_top': len(pop), 'n_bot': len(unpop),
        'pop_mean_top': float(pop['mean_pop'].mean()),
        'pop_mean_bot': float(unpop['mean_pop'].mean()),
        'q25_pop': float(q25), 'q75_pop': float(q75),
        'tests': [],
    }

    for m in numeric_metrics:
        try:
            t_vals = pop[m].dropna().values
            u_vals = unpop[m].dropna().values
            if len(t_vals) < 2 or len(u_vals) < 2 or np.all(t_vals == t_vals[0]) and np.all(u_vals == u_vals[0]) and t_vals[0] == u_vals[0]:
                # All values identical -> mannwhitneyu returns p=1.0 or NaN
                stat, p = np.nan, 1.0
            else:
                stat, p = mannwhitneyu(t_vals, u_vals, alternative='two-sided')
            if not math.isnan(p) and not math.isinf(p):
                cluster_tests['tests'].append({
                    'metric': m, 'test': 'mannwhitneyu',
                    'U': float(stat), 'p': float(p),
                    'mean_top': float(np.mean(t_vals)),
                    'mean_bot': float(np.mean(u_vals)),
                    'median_top': float(np.median(t_vals)),
                    'median_bot': float(np.median(u_vals)),
                })
                all_valid_pvalues.append(p)
                test_index_map.append((c, len(cluster_tests['tests']) - 1))
            else:
                cluster_tests['tests'].append({
                    'metric': m, 'test': 'mannwhitneyu',
                    'note': 'p-value invalido (NaN/Inf)', 'p': None,
                })
        except Exception as e:
            cluster_tests['tests'].append({
                'metric': m, 'test': 'mannwhitneyu',
                'note': f'erro: {e}', 'p': None,
            })

    try:
        top_genres = pop['genero_dominante'].value_counts()
        bot_genres = unpop['genero_dominante'].value_counts()
        all_idx = sorted(set(top_genres.index).union(set(bot_genres.index)))
        ct = pd.DataFrame(index=all_idx)
        ct['top'] = top_genres
        ct['bot'] = bot_genres
        ct = ct.fillna(0)
        ct = ct[(ct['top'] + ct['bot']) >= 1]
        if ct.shape[0] >= 2:
            chi2, p, dof, exp = chi2_contingency(ct.values)
            top_total = ct['top'].sum()
            bot_total = ct['bot'].sum()
            ct['pct_top'] = ct['top'] / top_total if top_total else 0
            ct['pct_bot'] = ct['bot'] / bot_total if bot_total else 0
            ct['lift'] = (ct['pct_top'] / ct['pct_bot']).replace(
                [np.inf, -np.inf], np.nan)
            top5 = ct.sort_values('lift', ascending=False).head(5)
            cluster_tests['tests'].append({
                'metric': 'genero_dominante', 'test': 'chi2',
                'chi2': float(chi2), 'dof': int(dof), 'p': float(p),
                'top5_lift_genres': top5[['top', 'bot', 'pct_top', 'pct_bot', 'lift']].to_dict('index'),
                'n_categories': int(ct.shape[0]),
            })
            all_valid_pvalues.append(p)
            test_index_map.append((c, len(cluster_tests['tests']) - 1))
        else:
            cluster_tests['tests'].append({
                'metric': 'genero_dominante', 'test': 'chi2',
                'note': 'categorias insuficientes', 'p': None,
            })
    except Exception as e:
        cluster_tests['tests'].append({
            'metric': 'genero_dominante', 'test': 'chi2',
            'note': f'erro: {e}', 'p': None,
        })

    results_by_cluster[int(c)] = cluster_tests

# 4. FDR CORRECTION
print()
print("=" * 80)
print("CORRECAO FDR (Benjamini-Hochberg) - somente sobre p-validos")
print("=" * 80)
print(f"Total de testes com p-value valido: {len(all_valid_pvalues)}")
if all_valid_pvalues:
    reject, pvals_corrected, _, _ = multipletests(all_valid_pvalues, alpha=0.01, method='fdr_bh')
    for (c, ti), pc, rj in zip(test_index_map, pvals_corrected, reject):
        results_by_cluster[c]['tests'][ti]['p_fdr'] = float(pc)
        results_by_cluster[c]['tests'][ti]['sig_fdr_0.01'] = bool(rj)
    print(f"Significativos apos FDR (alpha=0.01): {int(sum(reject))} de {len(all_valid_pvalues)}")

# 5. PRINT RELATORIO
print()
print("=" * 80)
print("RELATORIO DETALHADO POR CLUSTER (somente significativos p_fdr<0.01)")
print("=" * 80)

for c, res in results_by_cluster.items():
    print(f"\n############ CLUSTER {c} (n={res['n_total']}) ############")
    print(f"  Q25={res['q25_pop']:.2f}, Q75={res['q75_pop']:.2f}")
    print(f"  Top 25% n={res['n_top']} | Bot 25% n={res['n_bot']}")
    print(f"  Pop media: top={res['pop_mean_top']:.2f}, bot={res['pop_mean_bot']:.2f}")
    sig = [t for t in res['tests'] if t.get('sig_fdr_0.01')]
    if not sig:
        print("  Nenhuma diferenca estatisticamente significativa (FDR<0.01).")
    for t in sig:
        if t['test'] == 'mannwhitneyu':
            print(f"  * {t['metric']}: p={t['p']:.2e}, p_fdr={t['p_fdr']:.2e}")
            print(f"      top median={t['median_top']:.3f}, bot median={t['median_bot']:.3f}, "
                  f"diff_abs={t['mean_top']-t['mean_bot']:+.3f}")
        elif t['test'] == 'chi2':
            print(f"  * genero_dominante: chi2={t['chi2']:.2f}, dof={t['dof']}, "
                  f"p={t['p']:.2e}, p_fdr={t['p_fdr']:.2e}")
            for g, row in t.get('top5_lift_genres', {}).items():
                if not (isinstance(row['lift'], float) and math.isnan(row['lift'])):
                    print(f"      {g}: top={int(row['top'])} ({row['pct_top']*100:.1f}%), "
                          f"bot={int(row['bot'])} ({row['pct_bot']*100:.1f}%), "
                          f"lift={row['lift']:+.2f}x")

# 6. RESUMO
print()
print("=" * 80)
print("RESUMO POR METRICA (clusters onde a metrica foi significativa)")
print("=" * 80)
sig_summary = {}
for c, res in results_by_cluster.items():
    for t in res['tests']:
        if t.get('sig_fdr_0.01'):
            sig_summary.setdefault(t['metric'], []).append({'cluster': c, **t})

for k, v in sig_summary.items():
    print(f"\n{k}: significativo em {len(v)} cluster(s)")
    for x in v:
        if x['test'] == 'mannwhitneyu':
            print(f"  cluster {x['cluster']}: top med={x['median_top']:.3f} vs bot med={x['median_bot']:.3f} "
                  f"(p_fdr={x['p_fdr']:.2e})")
        else:
            print(f"  cluster {x['cluster']}: chi2 p_fdr={x['p_fdr']:.2e}")

# 7. SAVE JSON
def conv(o):
    if isinstance(o, (np.integer,)): return int(o)
    if isinstance(o, (np.floating,)):
        if math.isnan(o) or math.isinf(o): return None
        return float(o)
    if isinstance(o, (np.ndarray,)): return o.tolist()
    if isinstance(o, (np.bool_,)): return bool(o)
    if isinstance(o, dict): return {k: conv(v) for k, v in o.items()}
    if isinstance(o, list): return [conv(v) for v in o]
    return o

out = {
    'silhouette_scores': {int(k): float(v) for k, v in sil_scores.items()},
    'best_k_silhouette': int(best_k),
    'used_k': int(USE_K),
    'cluster_sizes': {int(k): int(v) for k, v in cluster_sizes.items()},
    'centroids': conv(centroids.round(4).to_dict()),
    'cluster_results': conv(results_by_cluster),
}
with open(r"C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\analysis_q6_results.json", "w") as f:
    json.dump(out, f, indent=2, ensure_ascii=False, default=str)
print("\nResultados salvos em analysis_q6_results.json")
