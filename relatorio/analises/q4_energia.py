"""Q4: Do more energetic songs do better?"""
import os
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import LogisticRegression

PARQUET_PATH = r"C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\data\processed\spotify_tracks_limpo.parquet"
ALPHA = 0.01

# ---- Load data ----
df = pd.read_parquet(PARQUET_PATH)
print("Shape:", df.shape)
print("Columns of interest:", [c for c in df.columns if c in ("energy", "popularity", "danceability", "valence", "loudness", "acousticness")])

# Subset to required columns, drop NA
cols = ["energy", "popularity", "danceability", "valence", "loudness", "acousticness"]
sub = df[cols].dropna()
n_total = len(sub)
print(f"N with complete data: {n_total}")

energy = sub["energy"].values
popularity = sub["popularity"].values

# ---- 1. Pearson + Spearman correlations ----
pearson_r, pearson_p = stats.pearsonr(energy, popularity)
spearman_r, spearman_p = stats.spearmanr(energy, popularity)
print(f"\nPearson: r={pearson_r:.4f}, p={pearson_p:.3e}")
print(f"Spearman: rho={spearman_r:.4f}, p={spearman_p:.3e}")

# ---- 2. Quartiles ----
quartiles = pd.qcut(sub["energy"], q=4, labels=["Q1", "Q2", "Q3", "Q4"])
sub = sub.assign(energy_q=quartiles)
print("\nQuartile bounds (energy):")
for q in ["Q1", "Q2", "Q3", "Q4"]:
    mask = sub["energy_q"] == q
    lo, hi = sub.loc[mask, "energy"].min(), sub.loc[mask, "energy"].max()
    print(f"  {q}: [{lo:.4f}, {hi:.4f}]  n={mask.sum()}")

print("\nPopularity by quartile:")
q_stats = []
for q in ["Q1", "Q2", "Q3", "Q4"]:
    pop_q = sub.loc[sub["energy_q"] == q, "popularity"].values
    n = len(pop_q)
    mean = pop_q.mean()
    median = np.median(pop_q)
    # 95% CI for the mean via t-distribution
    sem = stats.sem(pop_q)
    ci_low, ci_high = stats.t.interval(0.95, n - 1, loc=mean, scale=sem)
    print(f"  {q}: n={n}, mean={mean:.3f}, median={median:.1f}, 95% CI=[{ci_low:.3f}, {ci_high:.3f}]")
    q_stats.append((q, pop_q))

# ---- 3. Kruskal-Wallis + pairwise Mann-Whitney U with FDR (Benjamini-Hochberg) ----
groups = [sub.loc[sub["energy_q"] == q, "popularity"].values for q in ["Q1", "Q2", "Q3", "Q4"]]
H, p_kw = stats.kruskal(*groups)
print(f"\nKruskal-Wallis: H={H:.4f}, p={p_kw:.3e}")

pairs = []
labels = ["Q1", "Q2", "Q3", "Q4"]
for i in range(len(labels)):
    for j in range(i + 1, len(labels)):
        u, p = stats.mannwhitneyu(groups[i], groups[j], alternative="two-sided")
        pairs.append((labels[i], labels[j], u, p))

# FDR Benjamini-Hochberg
ps = np.array([p[3] for p in pairs])
m = len(ps)
order = np.argsort(ps)
ranked = ps[order]
adj = np.empty(m)
prev = 1.0
for k in range(m - 1, -1, -1):
    rank = k + 1
    val = min(prev, ranked[k] * m / rank)
    adj[k] = val
    prev = val
adj_ps = np.empty(m)
adj_ps[order] = adj

print("\nPairwise Mann-Whitney U (FDR-BH corrected):")
for (l1, l2, u, p), p_adj in zip(pairs, adj_ps):
    sig = "SIG" if p_adj < ALPHA else "ns"
    print(f"  {l1} vs {l2}: U={u:.0f}, p_raw={p:.3e}, p_adj={p_adj:.3e}  [{sig}]")

# ---- 4. Logistic regression: high popularity (top 25%) ----
threshold = sub["popularity"].quantile(0.75)
sub["high_pop"] = (sub["popularity"] >= threshold).astype(int)
print(f"\nHigh-popularity threshold (75th pct of popularity): {threshold:.1f}")
print(f"High popularity count: {sub['high_pop'].sum()} / {n_total} ({sub['high_pop'].mean()*100:.1f}%)")

X = sub[["energy", "danceability", "valence", "loudness", "acousticness"]].values
y = sub["high_pop"].values

# Standardize for numerical stability & comparable coefs
X_std = (X - X.mean(axis=0)) / X.std(axis=0)

model = LogisticRegression(max_iter=5000, solver="lbfgs")
model.fit(X_std, y)

# Wald test via observed information (sklearn does not provide it directly)
# Use the asymptotic approximation: SE = sqrt(diag(inv(X'WX))) with W=diag(p(1-p))
p_hat = model.predict_proba(X_std)[:, 1]
W = p_hat * (1 - p_hat)
# X' W X
XtWX = X_std.T @ (W[:, None] * X_std)
try:
    cov = np.linalg.inv(XtWX)
except np.linalg.LinAlgError:
    cov = np.linalg.pinv(XtWX)
se = np.sqrt(np.diag(cov))
z = model.coef_[0] / se
p_vals = 2 * (1 - stats.norm.cdf(np.abs(z)))
print("\nLogistic regression (high popularity ~ energy + controls), standardized features:")
for name, coef, se_i, z_i, p_i in zip(
    ["energy", "danceability", "valence", "loudness", "acousticness"],
    model.coef_[0], se, z, p_vals
):
    sig = "SIG" if p_i < ALPHA else "ns"
    print(f"  {name}: beta={coef:+.4f}, SE={se_i:.4f}, z={z_i:+.3f}, p={p_i:.3e}  [{sig}]")
print(f"  intercept: {model.intercept_[0]:+.4f}")
print(f"  pseudo R^2 (McFadden): {1 - (model.predict_log_proba(X_std)[:,1] * y + model.predict_log_proba(X_std)[:,0] * (1-y)).sum() / (-(y*np.log(y.mean()+1e-12)+(1-y)*np.log(1-y.mean()+1e-12))).sum():.4f}")
print(f"  n={n_total}, baseline rate={y.mean():.3f}")

# Persist results to a small text file for the parent agent
out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resultados", "q4_results.txt")
with open(out_path, "w", encoding="utf-8") as f:
    f.write(f"N={n_total}\n")
    f.write(f"Pearson r={pearson_r:.4f} p={pearson_p:.3e}\n")
    f.write(f"Spearman rho={spearman_r:.4f} p={spearman_p:.3e}\n")
    f.write(f"Kruskal-Wallis H={H:.4f} p={p_kw:.3e}\n")
    for (l1, l2, u, p), p_adj in zip(pairs, adj_ps):
        f.write(f"Pair {l1} vs {l2}: U={u:.0f} p_raw={p:.3e} p_adj={p_adj:.3e}\n")
    for name, coef, se_i, z_i, p_i in zip(
        ["energy", "danceability", "valence", "loudness", "acousticness"],
        model.coef_[0], se, z, p_vals
    ):
        f.write(f"Logistic {name}: beta={coef:+.4f} SE={se_i:.4f} z={z_i:+.3f} p={p_i:.3e}\n")
    f.write(f"Intercept: {model.intercept_[0]:+.4f}\n")
    f.write(f"Quartile threshold 75pct: {threshold:.1f}\n")
    for (q, vals), lo, hi in zip(
        [(lbl, sub.loc[sub['energy_q']==lbl, 'popularity'].values) for lbl in labels],
        [sub.loc[sub['energy_q']==q, 'energy'].min() for q in labels],
        [sub.loc[sub['energy_q']==q, 'energy'].max() for q in labels]
    ):
        f.write(f"{q} energy=[{lo:.4f},{hi:.4f}] n={len(vals)} mean={vals.mean():.3f} median={np.median(vals):.1f}\n")
print("\nWrote results to", out_path)
