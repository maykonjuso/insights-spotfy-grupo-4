"""Extrai features de audio com librosa e Essentia e classifica genero (GTZAN).

O dataset do Spotify traz as features ja calculadas (danceability, energy, key,
tempo...), mas nao explica como sao obtidas. Aqui o caminho inteiro fica visivel:
audio bruto -> DSP -> vetor de features -> classificador -> genero.

O GTZAN tem 1.000 clipes de 30s em 10 generos, com rotulo, entao da para medir
acuracia de verdade em vez de so olhar numeros bonitos.

As duas bibliotecas entram de proposito:
  librosa  - features espectrais (MFCC, chroma, contraste, centroide)
  Essentia - descritores de alto nivel que o Spotify tambem expoe
             (Danceability, KeyExtractor, RhythmExtractor, DynamicComplexity)

Requer LD_LIBRARY_PATH apontando para a libatomic extraida:
    LD_LIBRARY_PATH=~/.local/lib .venv/bin/python scripts/classificar_genero.py
"""

from __future__ import annotations

import argparse
import json
import time
import warnings
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

RAIZ = Path(__file__).resolve().parent.parent
AUDIO = RAIZ / "data" / "gtzan" / "genres"
FEATURES = RAIZ / "data" / "processed" / "gtzan_features.parquet"
SR = 22050          # taxa padrao do GTZAN; reamostrar acima disso nao agrega
DURACAO = 30.0


def extrair(caminho: Path) -> dict | None:
    """Extrai o vetor de features de um clipe. Roda em processo separado."""
    import librosa
    import essentia.standard as es

    try:
        y, sr = librosa.load(caminho, sr=SR, mono=True, duration=DURACAO)
    except Exception:
        return None
    if len(y) < sr * 5:
        return None
    y = y.astype(np.float32)
    f: dict[str, object] = {"arquivo": caminho.name, "genero": caminho.parent.name}

    # ---- librosa: descricao espectral do timbre -------------------------
    # MFCC e o descritor classico de timbre; media e desvio por coeficiente
    # resumem o clipe inteiro num vetor de tamanho fixo.
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
    for i in range(20):
        f[f"mfcc{i:02d}_media"] = float(mfcc[i].mean())
        f[f"mfcc{i:02d}_dp"] = float(mfcc[i].std())

    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    for i in range(12):
        f[f"chroma{i:02d}"] = float(chroma[i].mean())

    contraste = librosa.feature.spectral_contrast(y=y, sr=sr)
    for i in range(contraste.shape[0]):
        f[f"contraste{i}"] = float(contraste[i].mean())

    for nome, v in (
        ("centroide", librosa.feature.spectral_centroid(y=y, sr=sr)),
        ("rolloff", librosa.feature.spectral_rolloff(y=y, sr=sr)),
        ("largura", librosa.feature.spectral_bandwidth(y=y, sr=sr)),
        ("zcr", librosa.feature.zero_crossing_rate(y)),
        ("rms", librosa.feature.rms(y=y)),
    ):
        f[f"{nome}_media"] = float(v.mean())
        f[f"{nome}_dp"] = float(v.std())

    f["tempo_librosa"] = float(np.atleast_1d(librosa.beat.beat_track(y=y, sr=sr)[0])[0])

    # ---- Essentia: descritores de alto nivel ---------------------------
    # Sao os analogos diretos das colunas do dataset do Spotify, o que permite
    # comparar as duas fontes na mesma escala.
    try:
        f["tempo_essentia"] = float(es.RhythmExtractor2013(method="multifeature")(y)[0])
    except Exception:
        f["tempo_essentia"] = np.nan
    try:
        f["danceability"] = float(es.Danceability()(y)[0])
    except Exception:
        f["danceability"] = np.nan
    try:
        tom, escala, forca = es.KeyExtractor()(y)[:3]
        f["key_essentia"] = tom
        f["mode_essentia"] = escala
        f["key_forca"] = float(forca)
    except Exception:
        f["key_essentia"] = f["mode_essentia"] = None
        f["key_forca"] = np.nan
    try:
        f["complexidade_dinamica"] = float(es.DynamicComplexity()(y)[0])
    except Exception:
        f["complexidade_dinamica"] = np.nan
    return f


def construir(workers: int, limite: int | None) -> pd.DataFrame:
    arquivos = sorted(p for p in AUDIO.rglob("*.wav") if p.is_file())
    if not arquivos:
        raise SystemExit(f"Nenhum .wav em {AUDIO}")
    if limite:
        # amostra estratificada: mantem os 10 generos representados
        porg: dict[str, list[Path]] = {}
        for p in arquivos:
            porg.setdefault(p.parent.name, []).append(p)
        n = max(1, limite // len(porg))
        arquivos = [p for v in porg.values() for p in v[:n]]
    print(f"clipes: {len(arquivos):,} | workers: {workers}")

    linhas, t0 = [], time.time()
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for i, r in enumerate(ex.map(extrair, arquivos, chunksize=4), 1):
            if r:
                linhas.append(r)
            if i % 50 == 0 or i == len(arquivos):
                dt = time.time() - t0
                print(f"  {i}/{len(arquivos)} ({i/dt:.1f}/s, "
                      f"~{(len(arquivos)-i)/(i/dt)/60:.1f} min restantes)", flush=True)
    df = pd.DataFrame(linhas)
    FEATURES.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(FEATURES, index=False)
    print(f"\ngravado {FEATURES} ({df.shape[0]} x {df.shape[1]})")
    return df


def classificar(df: pd.DataFrame) -> None:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import classification_report, confusion_matrix
    from sklearn.model_selection import cross_val_score, train_test_split
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    y = df["genero"]
    X = df.drop(columns=["arquivo", "genero", "key_essentia", "mode_essentia"],
                errors="ignore").select_dtypes("number").fillna(0)
    print(f"\nmatriz: {X.shape[0]} clipes x {X.shape[1]} features, "
          f"{y.nunique()} generos")

    Xtr, Xte, ytr, yte = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y)

    for nome, modelo in (
        ("Regressao logistica", make_pipeline(StandardScaler(),
            LogisticRegression(max_iter=2000, n_jobs=-1))),
        ("Random forest", RandomForestClassifier(
            n_estimators=400, n_jobs=-1, random_state=42)),
    ):
        modelo.fit(Xtr, ytr)
        acc = modelo.score(Xte, yte)
        cv = cross_val_score(modelo, X, y, cv=5, n_jobs=-1)
        print(f"\n=== {nome} ===")
        print(f"  acuracia (holdout) : {acc:.1%}")
        print(f"  acuracia (CV 5x)   : {cv.mean():.1%} +/- {cv.std():.1%}")
        print(f"  baseline (aleatorio): {1/y.nunique():.1%}")
        if nome == "Random forest":
            pred = modelo.predict(Xte)
            print("\n" + classification_report(yte, pred, zero_division=0))
            cm = pd.DataFrame(confusion_matrix(yte, pred),
                              index=sorted(y.unique()), columns=sorted(y.unique()))
            print("Matriz de confusao (linha = verdadeiro, coluna = previsto):")
            print(cm.to_string())
            imp = pd.Series(modelo.feature_importances_, index=X.columns)
            print("\n15 features mais importantes:")
            print(imp.nlargest(15).to_string())

            # de onde vem o poder preditivo: librosa ou Essentia?
            alto = ["tempo_essentia", "danceability", "key_forca",
                    "complexidade_dinamica", "tempo_librosa"]
            print(f"\npeso das features de alto nivel (analogas ao Spotify): "
                  f"{imp[imp.index.isin(alto)].sum():.1%}")
            print(f"peso das espectrais (MFCC/chroma/contraste): "
                  f"{imp[~imp.index.isin(alto)].sum():.1%}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limite", type=int, help="usa so N clipes (teste rapido)")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--refazer", action="store_true", help="ignora o cache")
    args = ap.parse_args()

    if FEATURES.exists() and not args.refazer:
        df = pd.read_parquet(FEATURES)
        print(f"features do cache: {df.shape}")
    else:
        df = construir(args.workers, args.limite)
    classificar(df)


if __name__ == "__main__":
    main()
