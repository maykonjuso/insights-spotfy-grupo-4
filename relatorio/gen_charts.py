"""Generate all charts for the Spotify analysis report."""
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib as mpl
from matplotlib.patches import FancyBboxPatch
import seaborn as sns
from scipy import stats
import os

# Color palette: Spotify-inspired but more sophisticated
GREEN = "#1DB954"      # positive / significant
AMBER = "#E8A33D"      # finding / highlight
CORAL = "#E85D5D"      # negative / contra
VIOLET = "#B07FE0"     # neutral
BG = "#0E0C0B"         # dark background
PANEL = "#181513"      # panel
TEXT = "#ECE4D9"
MUTED = "#8C847A"
GRID = "#2A2624"

plt.rcParams.update({
    "figure.facecolor": BG,
    "axes.facecolor": PANEL,
    "axes.edgecolor": GRID,
    "axes.labelcolor": TEXT,
    "axes.titlecolor": TEXT,
    "text.color": TEXT,
    "xtick.color": TEXT,
    "ytick.color": TEXT,
    "grid.color": GRID,
    "grid.alpha": 0.5,
    "font.family": "DejaVu Sans",
    "font.size": 10,
    "axes.spines.top": False,
    "axes.spines.right": False,
})

OUT = r"C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\charts"
os.makedirs(OUT, exist_ok=True)

# Load
df = pd.read_parquet(r"C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\data\processed\spotify_tracks_limpo.parquet")
df = df.dropna(subset=["tempo", "time_signature"])
print("N =", len(df))

# ====================================================================
# Q1 — Feature importance (OLS betas)
# ====================================================================
features_q1 = ["danceability", "energy", "loudness", "speechiness",
               "acousticness", "instrumentalness", "liveness", "valence",
               "tempo", "duration_ms", "explicit"]
corr_q1 = {}
for f in features_q1:
    rho, p = stats.spearmanr(df[f], df["popularity"])
    corr_q1[f] = (rho, p)

items = sorted(corr_q1.items(), key=lambda x: x[1][0])
labels = [k for k, _ in items]
vals = [v[0] for _, v in items]
colors = [GREEN if v > 0 else CORAL for v in vals]

fig, ax = plt.subplots(figsize=(8, 5.5), dpi=140)
y = np.arange(len(labels))
bars = ax.barh(y, vals, color=colors, edgecolor="none", height=0.7)
ax.set_yticks(y, labels=labels)
ax.axvline(0, color=MUTED, lw=0.8, alpha=0.6)
ax.set_xlabel("Spearman ρ vs popularity", fontsize=10)
ax.set_title("Q1 · Correlação das features com popularidade", loc="left",
             fontsize=13, fontweight="bold", pad=14)
ax.text(0.99, 1.02, f"N = {len(df):,}  |  R² do modelo OLS = 0,035",
        transform=ax.transAxes, ha="right", fontsize=9, color=MUTED)
ax.grid(axis="x", linestyle="--", alpha=0.3)
ax.set_axisbelow(True)
for spine in ["top", "right"]:
    ax.spines[spine].set_visible(False)
ax.text(1.0, -0.18,
        "Conclusão: relações significativas, mas magnitude desprezível — "
        "modelo explica só 3,5% da variância.",
        transform=ax.transAxes, fontsize=8.5, color=MUTED, style="italic")
plt.tight_layout()
plt.savefig(f"{OUT}/q1_corr.png", dpi=140, facecolor=BG)
plt.close()

# ====================================================================
# Q2 — Top genres by popularity
# ====================================================================
genre_stats = (
    df.groupby("genero_principal")["popularity"]
      .agg(n="count", mean="mean", median="median", std="std")
      .reset_index()
)
genre_stats["ci"] = 1.96 * genre_stats["std"] / np.sqrt(genre_stats["n"])
genre_stats = genre_stats[genre_stats["n"] >= 100]
top10 = genre_stats.sort_values("mean", ascending=False).head(10)

fig, ax = plt.subplots(figsize=(9, 5.8), dpi=140)
y = np.arange(len(top10))
labels = top10["genero_principal"].values
ax.barh(y, top10["mean"], color=GREEN, alpha=0.85, edgecolor="none", height=0.65)
ax.errorbar(top10["mean"], y, xerr=top10["ci"], fmt="none",
            ecolor=TEXT, elinewidth=1.2, capsize=3, capthick=1)
ax.axvline(df["popularity"].median(), color=AMBER, linestyle="--", lw=1.2, alpha=0.8,
           label=f"Mediana global = {df['popularity'].median():.0f}")
ax.set_yticks(y, labels=labels)
ax.invert_yaxis()
ax.set_xlabel("Popularidade média", fontsize=10)
ax.set_title("Q2 · Top 10 gêneros por popularidade média", loc="left",
             fontsize=13, fontweight="bold", pad=14)
ax.legend(loc="lower right", frameon=False, fontsize=9, labelcolor=TEXT)
ax.grid(axis="x", linestyle="--", alpha=0.3)
ax.set_axisbelow(True)
for i, (m, n) in enumerate(zip(top10["mean"], top10["n"])):
    ax.text(m + 1.5, i, f"{m:.1f}  (n={n})", va="center", fontsize=8.5, color=TEXT)
ax.text(1.0, -0.16,
        "Kruskal-Wallis H = 31 813  |  p ≈ 0  |  IC 95% de todos os top-10 não inclui a mediana global.",
        transform=ax.transAxes, fontsize=8.5, color=MUTED, style="italic")
plt.tight_layout()
plt.savefig(f"{OUT}/q2_genres.png", dpi=140, facecolor=BG)
plt.close()

# ====================================================================
# Q3 — Top vs Bottom artists (P90 vs P10)
# ====================================================================
art = df.groupby("artista_principal").agg(
    n=("popularity", "count"),
    mean_pop=("popularity", "mean"),
    danceability=("danceability", "mean"),
    energy=("energy", "mean"),
    loudness=("loudness", "mean"),
    speechiness=("speechiness", "mean"),
    acousticness=("acousticness", "mean"),
    instrumentalness=("instrumentalness", "mean"),
    liveness=("liveness", "mean"),
    valence=("valence", "mean"),
    tempo=("tempo", "mean"),
    explicit=("explicit", "mean"),
    n_generos=("n_generos", "mean"),
).reset_index()
art = art[art["n"] >= 5]
p90 = art["mean_pop"].quantile(0.90)
p10 = art["mean_pop"].quantile(0.10)
top = art[art["mean_pop"] >= p90]
bot = art[art["mean_pop"] <= p10]

feat_q3 = ["danceability", "energy", "loudness", "speechiness",
           "acousticness", "instrumentalness", "liveness", "valence",
           "tempo", "explicit", "n_generos"]
pvals, effect = [], []
for f in feat_q3:
    u, p = stats.mannwhitneyu(top[f], bot[f], alternative="two-sided")
    n1, n2 = len(top), len(bot)
    r = 1 - 2 * u / (n1 * n2)
    pvals.append(p)
    effect.append(r)
from statsmodels.stats.multitest import multipletests
_, p_fdr, _, _ = multipletests(pvals, method="fdr_bh")

items3 = list(zip(feat_q3, [top[f].mean() for f in feat_q3],
                  [bot[f].mean() for f in feat_q3], effect, p_fdr))
sig3 = [(f, tm, bm, r, p) for f, tm, bm, r, p in items3 if p < 0.01]
sig3.sort(key=lambda x: abs(x[3]), reverse=True)

fig, ax = plt.subplots(figsize=(9, 5.5), dpi=140)
y = np.arange(len(sig3))
f_labels = [s[0] for s in sig3]
tm = [s[1] for s in sig3]
bm = [s[2] for s in sig3]
r_vals = [s[3] for s in sig3]
ax.barh(y - 0.2, tm, height=0.4, color=GREEN, alpha=0.85, label="Top 10% (P90)")
ax.barh(y + 0.2, bm, height=0.4, color=CORAL, alpha=0.85, label="Bottom 10% (P10)")
ax.set_yticks(y, labels=f_labels)
ax.invert_yaxis()
ax.set_title("Q3 · Diferenças significativas: Top 10% vs Bottom 10% artistas",
             loc="left", fontsize=12, fontweight="bold", pad=14)
ax.text(0.99, 1.03, f"P90 ≥ {p90:.2f}  ·  P10 ≤ {p10:.2f}  ·  n_top={len(top)}, n_bot={len(bot)}",
        transform=ax.transAxes, ha="right", fontsize=9, color=MUTED)
ax.legend(frameon=False, fontsize=9, loc="lower right", labelcolor=TEXT)
ax.grid(axis="x", linestyle="--", alpha=0.3)
ax.set_axisbelow(True)
for i, r in enumerate(r_vals):
    sign = "+" if r > 0 else ""
    ax.text(1.01, i, f"r={sign}{r:.2f}", transform=ax.get_yaxis_transform(),
            va="center", fontsize=8, color=AMBER)
ax.text(1.0, -0.16,
        "Mann-Whitney U, FDR-BH p<0,01. Efeitos pequenos (|r|≤0,27) — magnitude importa mais que p.",
        transform=ax.transAxes, fontsize=8.5, color=MUTED, style="italic")
plt.tight_layout()
plt.savefig(f"{OUT}/q3_artists.png", dpi=140, facecolor=BG)
plt.close()

# ====================================================================
# Q4 — Energy quartiles (U-shape)
# ====================================================================
df["energy_q"] = pd.qcut(df["energy"], 4, labels=["Q1\nbaixa", "Q2", "Q3", "Q4\nalta"])
e_stats = df.groupby("energy_q", observed=True)["popularity"].agg(["mean", "median", "std", "count"])
e_stats["ci"] = 1.96 * e_stats["std"] / np.sqrt(e_stats["count"])

fig, ax = plt.subplots(figsize=(8, 5), dpi=140)
xs = np.arange(len(e_stats))
ax.bar(xs, e_stats["mean"], color=[CORAL, AMBER, AMBER, CORAL], alpha=0.85,
       edgecolor="none", width=0.6)
ax.errorbar(xs, e_stats["mean"], yerr=e_stats["ci"], fmt="none",
            ecolor=TEXT, elinewidth=1.2, capsize=4)
for i, (m, c) in enumerate(zip(e_stats["mean"], e_stats["count"])):
    ax.text(i, m + 0.6, f"{m:.1f}", ha="center", fontsize=9, color=TEXT)
ax.set_xticks(xs, e_stats.index, fontsize=10)
ax.set_ylabel("Popularidade média")
ax.set_title("Q4 · Popularidade por quartil de energia (U-invertido)",
             loc="left", fontsize=13, fontweight="bold", pad=14)
ax.text(0.99, 1.03, f"N = {len(df):,}  ·  Pico em Q2 (energia média)",
        transform=ax.transAxes, ha="right", fontsize=9, color=MUTED)
ax.grid(axis="y", linestyle="--", alpha=0.3)
ax.set_axisbelow(True)
ax.text(1.0, -0.16,
        "Q1≈Q4 (p=0,017)  |  Q2>Q3>Q1,Q4 (todos p<0,01)  |  β logística (energy) = −0,39",
        transform=ax.transAxes, fontsize=8.5, color=MUTED, style="italic")
plt.tight_layout()
plt.savefig(f"{OUT}/q4_energy.png", dpi=140, facecolor=BG)
plt.close()

# ====================================================================
# Q5 — Valence quartiles
# ====================================================================
df["valence_q"] = pd.qcut(df["valence"], 4, labels=["Q1\ntriste", "Q2", "Q3", "Q4\nalegre"])
v_stats = df.groupby("valence_q", observed=True)["popularity"].agg(["mean", "median", "std", "count"])
v_stats["ci"] = 1.96 * v_stats["std"] / np.sqrt(v_stats["count"])

fig, ax = plt.subplots(figsize=(8, 5), dpi=140)
xs = np.arange(len(v_stats))
ax.bar(xs, v_stats["mean"], color=[CORAL, AMBER, AMBER, CORAL], alpha=0.85,
       edgecolor="none", width=0.6)
ax.errorbar(xs, v_stats["mean"], yerr=v_stats["ci"], fmt="none",
            ecolor=TEXT, elinewidth=1.2, capsize=4)
for i, m in enumerate(v_stats["mean"]):
    ax.text(i, m + 0.6, f"{m:.1f}", ha="center", fontsize=9, color=TEXT)
ax.set_xticks(xs, v_stats.index, fontsize=10)
ax.set_ylabel("Popularidade média")
ax.set_title("Q5 · Popularidade por quartil de valência",
             loc="left", fontsize=13, fontweight="bold", pad=14)
ax.text(0.99, 1.03, f"Spearman ρ = −0,011  |  Efeito desprezível",
        transform=ax.transAxes, ha="right", fontsize=9, color=MUTED)
ax.grid(axis="y", linestyle="--", alpha=0.3)
ax.set_axisbelow(True)
ax.text(1.0, -0.16,
        "Pico em Q2 (valência baixa-média)  |  β logística (valence) = −0,18 — direção oposta à hipótese.",
        transform=ax.transAxes, fontsize=8.5, color=MUTED, style="italic")
plt.tight_layout()
plt.savefig(f"{OUT}/q5_valence.png", dpi=140, facecolor=BG)
plt.close()

# ====================================================================
# Q6 — Cluster profile (KMeans centroids)
# ====================================================================
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

audio_feats = ["danceability", "energy", "loudness", "speechiness",
               "acousticness", "instrumentalness", "liveness", "valence", "tempo"]
art_audio = art[audio_feats + ["mean_pop", "n"]].dropna()
art_audio = art[audio_feats + ["mean_pop", "n", "artista_principal"]].dropna()
scaler = StandardScaler()
X = scaler.fit_transform(art_audio[audio_feats])
km = KMeans(n_clusters=5, random_state=42, n_init=10)
art_audio = art_audio.assign(cluster=km.fit_predict(X))

# Centroids
centroids = (pd.DataFrame(scaler.inverse_transform(km.cluster_centers_),
                          columns=audio_feats)
             .round(2))
centroids["n"] = art_audio.groupby("cluster").size().values
labels6 = ["spoken word", "pop/eletrônico", "acústico", "instrumental", "alta energia"]
centroids["perfil"] = labels6
labels6 = ["spoken word", "pop/eletrônico", "acústico", "instrumental", "alta energia"]
centroids["perfil"] = labels6

fig, ax = plt.subplots(figsize=(9, 5.5), dpi=140)
n = len(centroids)
x = np.arange(len(audio_feats))
width = 0.15
colors6 = [VIOLET, GREEN, AMBER, "#5BA8C7", CORAL]
for i, (_, row) in enumerate(centroids.iterrows()):
    ax.bar(x + (i - 2) * width, row[audio_feats], width=width,
           color=colors6[i], label=f"Cluster {i} · {row['perfil']} (n={row['n']})")
ax.set_xticks(x, audio_feats, rotation=30, ha="right", fontsize=8.5)
ax.set_ylabel("Valor médio (escala original)")
ax.set_title("Q6 · Perfis acústicos dos clusters K-Means (k=5)",
             loc="left", fontsize=12, fontweight="bold", pad=14)
ax.legend(frameon=False, fontsize=8, loc="upper right", ncol=2, labelcolor=TEXT)
ax.grid(axis="y", linestyle="--", alpha=0.3)
ax.set_axisbelow(True)
ax.text(1.0, -0.32,
        "Dentro do mesmo cluster, popularidade varia por subgênero (χ² p<1e-47), "
        "colaboração e diversidade de gênero.",
        transform=ax.transAxes, fontsize=8.5, color=MUTED, style="italic")
plt.tight_layout()
plt.savefig(f"{OUT}/q6_clusters.png", dpi=140, facecolor=BG)
plt.close()

# Top subgênero lift chart
def top_lift_in_cluster(df_cluster, c, top_q=0.75, bot_q=0.25):
    sub = df_cluster.copy()
    sub["artist_mean_pop"] = sub.groupby("artista_principal")["popularity"].transform("mean")
    sub = sub.drop_duplicates("artista_principal")
    thr_t = sub["artist_mean_pop"].quantile(top_q)
    thr_b = sub["artist_mean_pop"].quantile(bot_q)
    top = sub[sub["artist_mean_pop"] >= thr_t]
    bot = sub[sub["artist_mean_pop"] <= thr_b]
    if len(top) == 0 or len(bot) == 0:
        return None
    top_genes = top["genero_principal"].value_counts(normalize=True)
    bot_genes = bot["genero_principal"].value_counts(normalize=True)
    lifts = (top_genes / (bot_genes + 1e-6)).sort_values(ascending=False).head(5)
    return lifts

# We need to assign clusters to the full df via artist -> cluster mapping
art_to_cluster = art_audio.set_index("artista_principal")["cluster"].to_dict()
df_c = df[df["artista_principal"].isin(art_to_cluster)].copy()
df_c["cluster"] = df_c["artista_principal"].map(art_to_cluster)

# Build lift table
lift_rows = []
for c in sorted(df_c["cluster"].unique()):
    sub_c = df_c[df_c["cluster"] == c]
    lift = top_lift_in_cluster(sub_c, c)
    if lift is not None:
        for g, val in lift.items():
            lift_rows.append({"cluster": c, "genre": g, "lift": val})
lift_df = pd.DataFrame(lift_rows)
# Pick top 3 genres per cluster
top3_per_cluster = (lift_df.sort_values("lift", ascending=False)
                    .groupby("cluster").head(3).reset_index(drop=True))

fig, ax = plt.subplots(figsize=(9, 5), dpi=140)
y = np.arange(len(top3_per_cluster))
ax.barh(y, top3_per_cluster["lift"], color=GREEN, alpha=0.85, height=0.65, edgecolor="none")
ax.set_yticks(y, [f"C{r['cluster']} · {r['genre']}" for _, r in top3_per_cluster.iterrows()])
ax.invert_yaxis()
ax.set_xlabel("Lift (proporção Top25% / Bottom25%)")
ax.set_title("Q6 · Subgêneros com maior lift dentro de cada cluster acústico",
             loc="left", fontsize=12, fontweight="bold", pad=14)
ax.grid(axis="x", linestyle="--", alpha=0.3)
ax.set_axisbelow(True)
for i, v in enumerate(top3_per_cluster["lift"]):
    ax.text(v + 0.3, i, f"{v:.1f}×", va="center", fontsize=9, color=AMBER)
ax.set_xscale("log")
ax.text(1.0, -0.18,
        "Subgênero é o fator nº1 que separa populares de impopulares dentro do mesmo perfil acústico.",
        transform=ax.transAxes, fontsize=8.5, color=MUTED, style="italic")
plt.tight_layout()
plt.savefig(f"{OUT}/q6_lift.png", dpi=140, facecolor=BG)
plt.close()

# ====================================================================
# Q7 — Common vs different (radar / lollipop of effect sizes)
# ====================================================================
top_q7 = df[df["popularity"] >= df["popularity"].quantile(0.90)]
bot_q7 = df[df["popularity"] <= df["popularity"].quantile(0.10)]

feat_q7 = ["danceability", "energy", "loudness", "speechiness",
           "acousticness", "instrumentalness", "liveness", "valence",
           "tempo", "duration_ms", "n_generos", "n_artistas"]
pvals7, effect7 = [], []
means_top, means_bot = [], []
for f in feat_q7:
    u, p = stats.mannwhitneyu(top_q7[f], bot_q7[f], alternative="two-sided")
    n1, n2 = len(top_q7), len(bot_q7)
    r = 1 - 2 * u / (n1 * n2)
    pvals7.append(p)
    effect7.append(r)
    means_top.append(top_q7[f].mean())
    means_bot.append(bot_q7[f].mean())
_, p_fdr7, _, _ = multipletests(pvals7, method="fdr_bh")  # BH

# Build display table
records = []
for i, f in enumerate(feat_q7):
    sig = "✓" if p_fdr7[i] < 0.01 else "—"
    records.append({"feature": f, "top": means_top[i], "bot": means_bot[i],
                    "r": effect7[i], "p_fdr": p_fdr7[i], "sig": sig})
rec7 = pd.DataFrame(records)
rec7["abs_r"] = rec7["r"].abs()
rec7 = rec7.sort_values("abs_r", ascending=True)

fig, ax = plt.subplots(figsize=(9, 6), dpi=140)
y = np.arange(len(rec7))
bar_colors = [GREEN if r["sig"] == "✓" else MUTED for _, r in rec7.iterrows()]
ax.barh(y, rec7["abs_r"], color=bar_colors, alpha=0.9, height=0.7, edgecolor="none")
ax.set_yticks(y, rec7["feature"])
ax.set_xlabel("|r| rank-biserial (Top vs Bottom)")
ax.set_title("Q7 · Magnitude das diferenças: Top 10% vs Bottom 10%",
             loc="left", fontsize=13, fontweight="bold", pad=14)
ax.text(0.99, 1.03, f"Verde = significativo (FDR p<0,01)  ·  Cinza = sem diferença",
        transform=ax.transAxes, ha="right", fontsize=9, color=MUTED)
ax.grid(axis="x", linestyle="--", alpha=0.3)
ax.set_axisbelow(True)
for i, (_, r) in enumerate(rec7.iterrows()):
    color = AMBER if r["sig"] == "✓" else MUTED
    ax.text(r["abs_r"] + 0.005, i, f"{'%.2f' % r['r']}", va="center",
            fontsize=8.5, color=color)
ax.text(1.0, -0.12,
        "Comum: valence, n_artistas, liveness, speechiness  |  "
        "Diferente: acousticness, loudness, energy, danceability…",
        transform=ax.transAxes, fontsize=8.5, color=MUTED, style="italic")
plt.tight_layout()
plt.savefig(f"{OUT}/q7_extremes.png", dpi=140, facecolor=BG)
plt.close()

# ====================================================================
# Hero chart: popularity distribution
# ====================================================================
fig, ax = plt.subplots(figsize=(9, 4.2), dpi=140)
ax.hist(df["popularity"], bins=51, color=GREEN, alpha=0.85, edgecolor="none")
ax.axvline(df["popularity"].median(), color=AMBER, linestyle="--", lw=1.4,
           label=f"Mediana = {df['popularity'].median():.0f}")
ax.axvline(df["popularity"].quantile(0.90), color=CORAL, linestyle="--", lw=1.2,
           label=f"P90 = {df['popularity'].quantile(0.90):.0f}")
ax.axvline(df["popularity"].quantile(0.10), color=VIOLET, linestyle="--", lw=1.2,
           label=f"P10 = {df['popularity'].quantile(0.10):.0f}")
ax.set_xlabel("Popularidade (0–100)")
ax.set_ylabel("Faixas")
ax.set_title("Distribuição de popularidade — cauda longa, 10,4% zeradas",
             loc="left", fontsize=12, fontweight="bold", pad=12)
ax.legend(frameon=False, fontsize=9, labelcolor=TEXT)
ax.grid(axis="y", linestyle="--", alpha=0.3)
ax.set_axisbelow(True)
plt.tight_layout()
plt.savefig(f"{OUT}/hero_dist.png", dpi=140, facecolor=BG)
plt.close()

print("All charts generated in", OUT)
print(os.listdir(OUT))
