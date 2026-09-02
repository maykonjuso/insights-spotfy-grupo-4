"""Regenerate the report charts with clearer, presentation-ready layouts.

This script is intentionally self-contained and uses project-relative paths so it
can be run from any checkout of the repository.
"""
from __future__ import annotations

import base64
import re
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from scipy import stats
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from statsmodels.stats.multitest import multipletests


ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "relatorio"
CHART_DIR = REPORT_DIR / "charts"
REPORT = REPORT_DIR / "report.html"
PARQUET = ROOT / "data" / "processed" / "spotify_tracks_limpo.parquet"
CSV_RAW = ROOT / "dataset2(in).csv"

GREEN = "#1DB954"
GREEN_2 = "#0E8F48"
AMBER = "#E8A33D"
CORAL = "#E85D5D"
VIOLET = "#B07FE0"
CYAN = "#5BB8D6"
BG = "#0E0C0B"
PANEL = "#181513"
TEXT = "#F0E8DC"
MUTED = "#A79E93"
GRID = "#2A2624"

FEATURE_LABELS = {
    "danceability": "Dançabilidade",
    "energy": "Energia",
    "loudness": "Loudness",
    "speechiness": "Fala",
    "acousticness": "Acústica",
    "instrumentalness": "Instrumental",
    "liveness": "Ao vivo",
    "valence": "Valência",
    "tempo": "Tempo",
    "duration_ms": "Duração",
    "explicit": "Explícita",
    "n_generos": "Nº gêneros",
    "n_artistas": "Nº artistas",
}


def setup_style() -> None:
    plt.rcParams.update(
        {
            "figure.facecolor": BG,
            "savefig.facecolor": BG,
            "axes.facecolor": PANEL,
            "axes.edgecolor": GRID,
            "axes.labelcolor": TEXT,
            "axes.titlecolor": TEXT,
            "text.color": TEXT,
            "xtick.color": TEXT,
            "ytick.color": TEXT,
            "grid.color": GRID,
            "grid.alpha": 0.55,
            "font.family": "DejaVu Sans",
            "font.size": 11,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.titleweight": "bold",
            "axes.titlepad": 18,
        }
    )


def save(fig: plt.Figure, name: str) -> None:
    CHART_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(CHART_DIR / name, dpi=160, bbox_inches="tight", pad_inches=0.22)
    plt.close(fig)


def load_data() -> pd.DataFrame:
    if PARQUET.exists():
        df = pd.read_parquet(PARQUET)
    else:
        raw = pd.read_csv(CSV_RAW)
        raw = raw.drop(columns=[c for c in raw.columns if c.startswith("Unnamed:")])
        raw = raw.dropna(subset=["track_id", "artists", "album_name", "track_name"])
        raw = raw.drop_duplicates()
        raw.loc[raw["tempo"] == 0, "tempo"] = np.nan
        raw.loc[raw["time_signature"].isin([0, 1]), "time_signature"] = np.nan
        raw.loc[raw["duration_ms"] == 0, "duration_ms"] = np.nan

        feature_cols = [
            "duration_ms",
            "explicit",
            "danceability",
            "energy",
            "key",
            "loudness",
            "mode",
            "speechiness",
            "acousticness",
            "instrumentalness",
            "liveness",
            "valence",
            "tempo",
            "time_signature",
            "popularity",
        ]
        first_cols = ["artists", "album_name", "track_name"]
        agg = {c: "first" for c in first_cols + feature_cols}
        agg["track_genre"] = lambda s: ";".join(sorted(pd.Series(s).dropna().astype(str).unique()))
        df = raw.groupby("track_id", as_index=False).agg(agg)
        df = df.rename(columns={"track_genre": "generos"})
        df["n_generos"] = df["generos"].str.split(";").str.len()
        df["genero_principal"] = df["generos"].str.split(";").str[0]
        df["n_artistas"] = df["artists"].astype(str).str.split(";").str.len()
        df["artista_principal"] = df["artists"].astype(str).str.split(";").str[0]
        df["duracao_min"] = df["duration_ms"] / 60000

    df = df.dropna(subset=["tempo", "time_signature", "duration_ms"]).copy()
    df["explicit"] = df["explicit"].astype(bool).astype(int)
    return df


def annotate_note(ax: plt.Axes, text: str) -> None:
    ax.text(
        0,
        -0.16,
        text,
        transform=ax.transAxes,
        ha="left",
        va="top",
        fontsize=9.5,
        color=MUTED,
        style="italic",
        wrap=True,
    )


def chart_hero(df: pd.DataFrame) -> None:
    fig, ax = plt.subplots(figsize=(12, 5.2), constrained_layout=True)
    ax.hist(df["popularity"], bins=np.arange(-0.5, 101.5, 2), color=GREEN, alpha=0.88)
    for value, color, label in [
        (df["popularity"].quantile(0.10), VIOLET, "P10"),
        (df["popularity"].median(), AMBER, "Mediana"),
        (df["popularity"].quantile(0.90), CORAL, "P90"),
    ]:
        ax.axvline(value, color=color, linestyle="--", lw=1.8)
        ax.text(value + 1.2, ax.get_ylim()[1] * 0.9, f"{label} = {value:.0f}", color=color, fontsize=10)
    ax.set_title("Distribuição de popularidade", loc="left", fontsize=18)
    ax.set_xlabel("Popularidade Spotify (0-100)")
    ax.set_ylabel("Quantidade de faixas")
    ax.grid(axis="y", linestyle="--")
    ax.set_axisbelow(True)
    annotate_note(ax, "Cauda longa: muitas faixas pouco populares e uma minoria concentrada acima de 60 pontos.")
    save(fig, "hero_dist.png")


def chart_q1(df: pd.DataFrame) -> None:
    features = [
        "danceability",
        "energy",
        "loudness",
        "speechiness",
        "acousticness",
        "instrumentalness",
        "liveness",
        "valence",
        "tempo",
        "duration_ms",
        "explicit",
    ]
    rows = []
    for feature in features:
        rho, p = stats.spearmanr(df[feature], df["popularity"], nan_policy="omit")
        rows.append((feature, rho, p))
    rows = sorted(rows, key=lambda row: row[1])
    labels = [FEATURE_LABELS[f] for f, _, _ in rows]
    values = np.array([rho for _, rho, _ in rows])

    fig, ax = plt.subplots(figsize=(12, 7.2), constrained_layout=True)
    y = np.arange(len(rows))
    colors = [GREEN if v >= 0 else CORAL for v in values]
    ax.barh(y, values, color=colors, height=0.68)
    ax.axvline(0, color=TEXT, lw=1, alpha=0.55)
    ax.set_yticks(y, labels)
    ax.set_xlim(-0.14, 0.14)
    ax.set_xlabel("Correlação de Spearman com popularity")
    ax.set_title("Q1 - Features de áudio têm associação fraca com popularidade", loc="left", fontsize=17)
    ax.text(1, 1.02, "R² do modelo OLS = 0,035", transform=ax.transAxes, ha="right", color=MUTED)
    ax.grid(axis="x", linestyle="--")
    ax.set_axisbelow(True)
    for yi, value in zip(y, values):
        if value < -0.03:
            ax.text(value + 0.006, yi, f"{value:+.3f}", va="center", ha="left", fontsize=10, color=TEXT)
        elif value < 0:
            ax.text(value - 0.006, yi, f"{value:+.3f}", va="center", ha="right", fontsize=10, color=TEXT)
        else:
            ax.text(value + 0.006, yi, f"{value:+.3f}", va="center", ha="left", fontsize=10, color=TEXT)
    annotate_note(ax, "Mesmo as maiores barras ficam perto de zero: o efeito existe, mas é pequeno na prática.")
    save(fig, "q1_corr.png")


def chart_q2(df: pd.DataFrame) -> None:
    genre_stats = (
        df.groupby("genero_principal")["popularity"]
        .agg(n="count", mean="mean", std="std")
        .reset_index()
    )
    genre_stats["ci"] = 1.96 * genre_stats["std"] / np.sqrt(genre_stats["n"])
    top10 = genre_stats[genre_stats["n"] >= 100].sort_values("mean", ascending=False).head(10)

    fig, ax = plt.subplots(figsize=(12, 7), constrained_layout=True)
    y = np.arange(len(top10))
    ax.barh(y, top10["mean"], color=GREEN, height=0.68)
    ax.errorbar(top10["mean"], y, xerr=top10["ci"], fmt="none", ecolor=TEXT, capsize=4, lw=1.2)
    median = df["popularity"].median()
    ax.axvline(median, color=AMBER, linestyle="--", lw=1.6)
    ax.text(median + 0.8, len(top10) - 0.2, f"mediana global = {median:.0f}", color=AMBER, fontsize=10)
    ax.set_yticks(y, top10["genero_principal"])
    ax.invert_yaxis()
    ax.set_xlim(0, max(68, top10["mean"].max() + 8))
    ax.set_xlabel("Popularidade média")
    ax.set_title("Q2 - Top 10 gêneros por popularidade média", loc="left", fontsize=17)
    ax.grid(axis="x", linestyle="--")
    ax.set_axisbelow(True)
    for yi, (_, row) in enumerate(top10.iterrows()):
        label_x = row["mean"] + row["ci"] + 0.8
        ax.text(label_x, yi, f"{row['mean']:.1f}   n={int(row['n'])}", va="center", fontsize=10)
    annotate_note(ax, "Ranking filtrado para n >= 100; barras mostram média e intervalo de confiança de 95%.")
    save(fig, "q2_genres.png")


def artist_table(df: pd.DataFrame) -> pd.DataFrame:
    return (
        df.groupby("artista_principal")
        .agg(
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
            n_artistas=("n_artistas", "mean"),
        )
        .reset_index()
        .query("n >= 5")
    )


def chart_q3(art: pd.DataFrame) -> None:
    p90 = art["mean_pop"].quantile(0.90)
    p10 = art["mean_pop"].quantile(0.10)
    top = art[art["mean_pop"] >= p90]
    bot = art[art["mean_pop"] <= p10]
    features = [
        "danceability",
        "energy",
        "loudness",
        "speechiness",
        "acousticness",
        "instrumentalness",
        "liveness",
        "valence",
        "tempo",
        "explicit",
        "n_generos",
    ]
    records = []
    pvals = []
    for feature in features:
        u, p = stats.mannwhitneyu(top[feature], bot[feature], alternative="two-sided")
        r = 1 - 2 * u / (len(top) * len(bot))
        pvals.append(p)
        records.append({"feature": feature, "r": r, "top": top[feature].mean(), "bottom": bot[feature].mean()})
    _, p_fdr, _, _ = multipletests(pvals, method="fdr_bh")
    for rec, p in zip(records, p_fdr):
        rec["p_fdr"] = p
    sig = pd.DataFrame(records).query("p_fdr < 0.01").copy()
    sig["abs_r"] = sig["r"].abs()
    sig = sig.sort_values("abs_r")

    fig, ax = plt.subplots(figsize=(12, 6.6), constrained_layout=True)
    y = np.arange(len(sig))
    colors = [GREEN if r < 0 else CORAL for r in sig["r"]]
    ax.barh(y, sig["r"], color=colors, height=0.65)
    ax.axvline(0, color=TEXT, lw=1, alpha=0.55)
    ax.set_yticks(y, [FEATURE_LABELS[f] for f in sig["feature"]])
    ax.set_xlim(-0.32, 0.22)
    ax.set_xlabel("Tamanho de efeito rank-biserial (r)")
    ax.set_title("Q3 - O que diferencia artistas populares dos pouco populares", loc="left", fontsize=17)
    ax.text(1, 1.02, f"P90 >= {p90:.2f} | P10 <= {p10:.2f} | {len(top)} vs {len(bot)} artistas", transform=ax.transAxes, ha="right", color=MUTED)
    ax.grid(axis="x", linestyle="--")
    ax.set_axisbelow(True)
    for yi, row in enumerate(sig.itertuples()):
        if row.r < -0.08:
            ax.text(row.r + 0.012, yi, f"{row.r:+.2f}", va="center", ha="left", fontsize=10, color=TEXT)
        else:
            ax.text(row.r + 0.012, yi, f"{row.r:+.2f}", va="center", ha="left", fontsize=10, color=TEXT)
    annotate_note(ax, "Escala única de efeito; sinal negativo indica média maior no grupo Top pela fórmula usada.")
    save(fig, "q3_artists.png")


def quartile_chart(df: pd.DataFrame, feature: str, name: str, labels: list[str], title: str, note: str) -> None:
    q = pd.qcut(df[feature], 4, labels=labels)
    stats_df = df.assign(q=q).groupby("q", observed=True)["popularity"].agg(["mean", "std", "count"])
    stats_df["ci"] = 1.96 * stats_df["std"] / np.sqrt(stats_df["count"])

    fig, ax = plt.subplots(figsize=(10.5, 6.2), constrained_layout=True)
    x = np.arange(len(stats_df))
    colors = [CORAL, AMBER, AMBER, CORAL]
    ax.bar(x, stats_df["mean"], yerr=stats_df["ci"], capsize=5, color=colors, width=0.62, error_kw={"ecolor": TEXT, "lw": 1.2})
    ax.set_xticks(x, stats_df.index)
    ax.set_ylim(0, max(42, stats_df["mean"].max() + 5))
    ax.set_ylabel("Popularidade média")
    ax.set_title(title, loc="left", fontsize=17)
    ax.grid(axis="y", linestyle="--")
    ax.set_axisbelow(True)
    for xi, value in enumerate(stats_df["mean"]):
        ax.text(xi, value + 0.8, f"{value:.1f}", ha="center", fontsize=12, fontweight="bold")
    annotate_note(ax, note)
    save(fig, name)


def chart_q6(df: pd.DataFrame, art: pd.DataFrame) -> None:
    features = [
        "danceability",
        "energy",
        "loudness",
        "speechiness",
        "acousticness",
        "instrumentalness",
        "liveness",
        "valence",
        "tempo",
    ]
    art_audio = art[["artista_principal", "mean_pop", "n"] + features].dropna().copy()
    scaler = StandardScaler()
    x = scaler.fit_transform(art_audio[features])
    km = KMeans(n_clusters=5, random_state=42, n_init=20)
    art_audio["cluster"] = km.fit_predict(x)

    centroids_z = pd.DataFrame(km.cluster_centers_, columns=features)
    order = centroids_z["speechiness"].sort_values(ascending=False).index.tolist()
    remaining = [i for i in centroids_z.index if i not in order[:1]]
    order = order[:1] + sorted(remaining, key=lambda i: centroids_z.loc[i, "energy"])
    centroids_z = centroids_z.loc[order].reset_index(drop=True)
    counts = art_audio["cluster"].value_counts().reindex(order).to_numpy()

    fig, ax = plt.subplots(figsize=(12, 6.4), constrained_layout=True)
    cmap = LinearSegmentedColormap.from_list("spotify_div", [CORAL, PANEL, GREEN])
    im = ax.imshow(centroids_z[features], aspect="auto", cmap=cmap, vmin=-1.6, vmax=1.6)
    ax.set_xticks(np.arange(len(features)), [FEATURE_LABELS[f] for f in features], rotation=28, ha="right")
    ax.set_yticks(np.arange(5), [f"Cluster {i}  (n={n})" for i, n in enumerate(counts)])
    ax.set_title("Q6 - Perfil dos clusters em escala comparável", loc="left", fontsize=17)
    for i in range(centroids_z.shape[0]):
        for j in range(len(features)):
            val = centroids_z.iloc[i, j]
            color = TEXT if abs(val) < 1 else BG
            ax.text(j, i, f"{val:+.1f}", ha="center", va="center", fontsize=8.5, color=color)
    cbar = fig.colorbar(im, ax=ax, shrink=0.86, pad=0.02)
    cbar.set_label("Desvio em relação à média dos artistas (z-score)")
    annotate_note(ax, "Heatmap substitui barras em escala original: tempo e loudness deixam de esconder as features 0-1.")
    save(fig, "q6_clusters.png")

    art_to_cluster = art_audio.set_index("artista_principal")["cluster"].to_dict()
    df_c = df[df["artista_principal"].isin(art_to_cluster)].copy()
    df_c["cluster"] = df_c["artista_principal"].map(art_to_cluster)
    rows = []
    for cluster, sub in df_c.groupby("cluster"):
        artist_pop = sub.groupby("artista_principal")["popularity"].mean()
        top_artists = artist_pop[artist_pop >= artist_pop.quantile(0.75)].index
        bot_artists = artist_pop[artist_pop <= artist_pop.quantile(0.25)].index
        top_genres = sub[sub["artista_principal"].isin(top_artists)].drop_duplicates("artista_principal")["genero_principal"].value_counts(normalize=True)
        bot_genres = sub[sub["artista_principal"].isin(bot_artists)].drop_duplicates("artista_principal")["genero_principal"].value_counts(normalize=True)
        lifts = (top_genres / (bot_genres + 1e-6)).replace([np.inf, -np.inf], np.nan).dropna()
        for genre, lift in lifts.sort_values(ascending=False).head(3).items():
            if lift >= 1:
                rows.append({"cluster": int(cluster), "genre": genre, "lift": float(lift)})
    lift_df = pd.DataFrame(rows).sort_values(["cluster", "lift"], ascending=[True, False])

    fig, ax = plt.subplots(figsize=(12, 7), constrained_layout=True)
    y = np.arange(len(lift_df))
    palette = [GREEN, AMBER, CYAN, VIOLET, CORAL]
    colors = [palette[c % len(palette)] for c in lift_df["cluster"]]
    labels = [f"C{row.cluster} - {row.genre}" for row in lift_df.itertuples()]
    ax.barh(y, lift_df["lift"], color=colors, height=0.64)
    ax.set_yticks(y, labels)
    ax.invert_yaxis()
    ax.set_xscale("log")
    ax.set_xticks([1, 2, 5, 10, 20, 30])
    ax.set_xticklabels(["1x", "2x", "5x", "10x", "20x", "30x"])
    ax.set_xlabel("Lift: presença no Top25% / Bottom25%")
    ax.set_title("Q6 - Subgêneros que mais separam artistas no mesmo cluster", loc="left", fontsize=17)
    ax.grid(axis="x", linestyle="--")
    ax.set_axisbelow(True)
    for yi, lift in enumerate(lift_df["lift"]):
        ax.text(lift * 1.08, yi, f"{lift:.1f}x", va="center", fontsize=10)
    annotate_note(ax, "Cada cluster aparece em cor própria; valores acima de 1 indicam sobrerrepresentação entre artistas populares.")
    save(fig, "q6_lift.png")


def chart_q7(df: pd.DataFrame) -> None:
    top = df[df["popularity"] >= df["popularity"].quantile(0.90)]
    bottom = df[df["popularity"] <= df["popularity"].quantile(0.10)]
    features = [
        "danceability",
        "energy",
        "loudness",
        "speechiness",
        "acousticness",
        "instrumentalness",
        "liveness",
        "valence",
        "tempo",
        "duration_ms",
        "n_generos",
        "n_artistas",
    ]
    records = []
    pvals = []
    for feature in features:
        u, p = stats.mannwhitneyu(top[feature], bottom[feature], alternative="two-sided")
        r = 1 - 2 * u / (len(top) * len(bottom))
        pvals.append(p)
        records.append({"feature": feature, "r": r})
    _, p_fdr, _, _ = multipletests(pvals, method="fdr_bh")
    for rec, p in zip(records, p_fdr):
        rec["p_fdr"] = p
        rec["abs_r"] = abs(rec["r"])
    rec = pd.DataFrame(records).sort_values("abs_r")

    fig, ax = plt.subplots(figsize=(12, 7.2), constrained_layout=True)
    y = np.arange(len(rec))
    colors = [GREEN if p < 0.01 else MUTED for p in rec["p_fdr"]]
    ax.barh(y, rec["abs_r"], color=colors, height=0.66)
    ax.set_yticks(y, [FEATURE_LABELS[f] for f in rec["feature"]])
    ax.set_xlim(0, max(0.20, rec["abs_r"].max() + 0.035))
    ax.set_xlabel("|r| rank-biserial")
    ax.set_title("Q7 - Magnitude das diferenças entre Top 10% e Bottom 10%", loc="left", fontsize=17)
    ax.grid(axis="x", linestyle="--")
    ax.set_axisbelow(True)
    for yi, row in enumerate(rec.itertuples()):
        ax.text(row.abs_r + 0.004, yi, f"{row.r:+.2f}", va="center", fontsize=10, color=TEXT)
    ax.text(1, 1.02, "verde = significativo | cinza = sem diferença", transform=ax.transAxes, ha="right", color=MUTED)
    annotate_note(ax, "Mesmo as diferenças significativas são pequenas; o gráfico prioriza magnitude em vez de p-valor.")
    save(fig, "q7_extremes.png")


def update_report_images() -> None:
    names = [
        "hero_dist.png",
        "q1_corr.png",
        "q2_genres.png",
        "q3_artists.png",
        "q4_energy.png",
        "q5_valence.png",
        "q6_clusters.png",
        "q6_lift.png",
        "q7_extremes.png",
    ]
    html = REPORT.read_text(encoding="utf-8")
    src_re = re.compile(r'src="data:image/png;base64,[^"]+"')
    matches = list(src_re.finditer(html))
    if len(matches) != len(names):
        raise RuntimeError(f"Expected {len(names)} embedded images, found {len(matches)}")

    replacements = []
    for name in names:
        data = base64.b64encode((CHART_DIR / name).read_bytes()).decode("ascii")
        replacements.append(f'src="data:image/png;base64,{data}"')

    chunks = []
    pos = 0
    for match, replacement in zip(matches, replacements):
        chunks.append(html[pos : match.start()])
        chunks.append(replacement)
        pos = match.end()
    chunks.append(html[pos:])
    html = "".join(chunks)

    html = html.replace(
        "Figura 6.1 · Centroides das 9 features por cluster (K-Means, k=5, silhueta = 0,213).",
        "Figura 6.1 · Perfis dos clusters em z-score: cores mostram quais features ficam acima ou abaixo da média dos artistas.",
    )
    REPORT.write_text(html, encoding="utf-8")


def main() -> None:
    setup_style()
    df = load_data()
    art = artist_table(df)
    chart_hero(df)
    chart_q1(df)
    chart_q2(df)
    chart_q3(art)
    quartile_chart(
        df,
        "energy",
        "q4_energy.png",
        ["Q1\nbaixa", "Q2", "Q3", "Q4\nalta"],
        "Q4 - Popularidade por quartil de energia",
        "Padrão de U-invertido: o pico fica nas faixas de energia média, não nas mais energéticas.",
    )
    quartile_chart(
        df,
        "valence",
        "q5_valence.png",
        ["Q1\ntriste", "Q2", "Q3", "Q4\nalegre"],
        "Q5 - Popularidade por quartil de valência",
        "A variação existe, mas é pequena; a preferência feliz vs triste não aparece como efeito forte.",
    )
    chart_q6(df, art)
    chart_q7(df)
    update_report_images()
    print(f"Updated charts in {CHART_DIR}")
    print(f"Updated embedded images in {REPORT}")


if __name__ == "__main__":
    main()
