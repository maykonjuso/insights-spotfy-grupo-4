"""Treina o classificador de genero que roda no navegador e exporta os pesos.

As features vem de scripts/ts/extrair_gtzan.mts, ou seja, do mesmo codigo
TypeScript que a aplicacao Next usa na inferencia. Treinar sobre a saida do
proprio extrator evita divergencia entre treino e producao -- o problema
classico de treinar com librosa e inferir com outra implementacao.

O modelo exportado e uma regressao logistica multinomial: so escalonamento +
uma matriz de pesos, o que cabe num modulo TypeScript pequeno e roda em
milissegundos no browser, sem runtime de ML.

    .venv/bin/python scripts/treinar_classificador_web.py
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler

RAIZ = Path(__file__).resolve().parent.parent
FEATURES = RAIZ / "data" / "processed" / "gtzan_features_web.csv"
MODELO = RAIZ / "src" / "lib" / "genre-model.ts"


def main() -> None:
    if not FEATURES.exists():
        raise SystemExit(
            f"{FEATURES} nao existe. Rode antes:\n"
            "  node --experimental-strip-types scripts/ts/extrair_gtzan.mts"
        )

    df = pd.read_csv(FEATURES)
    colunas = [c for c in df.columns if c not in ("arquivo", "genero")]
    X = df[colunas].to_numpy(dtype=float)
    y = df["genero"].to_numpy()
    print(f"matriz: {X.shape[0]} clipes x {X.shape[1]} features, {len(set(y))} generos")

    escalonador = StandardScaler().fit(X)
    Xs = escalonador.transform(X)

    # regularizacao escolhida por CV: com 70 features e 1.000 clipes, C errado
    # custa alguns pontos de acuracia
    melhor_c, melhor_cv = 1.0, None
    for c in (0.03, 0.1, 0.3, 1.0, 3.0):
        pontos = cross_val_score(
            LogisticRegression(max_iter=5000, C=c), Xs, y, cv=5, n_jobs=-1)
        print(f"  C={c:<5} CV = {pontos.mean():.1%} +/- {pontos.std():.1%}")
        if melhor_cv is None or pontos.mean() > melhor_cv.mean():
            melhor_c, melhor_cv = c, pontos

    cv = melhor_cv
    print(f"\nC escolhido: {melhor_c}")

    Xtr, Xte, ytr, yte = train_test_split(
        Xs, y, test_size=0.25, random_state=42, stratify=y)

    modelo = LogisticRegression(max_iter=5000, C=melhor_c)
    modelo.fit(Xtr, ytr)
    holdout = modelo.score(Xte, yte)

    print(f"\nacuracia (holdout 25%) : {holdout:.1%}")
    print(f"acuracia (CV 5x)       : {cv.mean():.1%} +/- {cv.std():.1%}")
    print(f"baseline (aleatorio)   : {1/len(set(y)):.1%}\n")
    print(classification_report(yte, modelo.predict(Xte), zero_division=0))
    cm = pd.DataFrame(confusion_matrix(yte, modelo.predict(Xte)),
                      index=sorted(set(y)), columns=sorted(set(y)))
    print("Matriz de confusao (linha = verdadeiro, coluna = previsto):")
    print(cm.to_string())

    # modelo final usa 100% dos dados; as metricas acima vem do holdout/CV
    final = LogisticRegression(max_iter=5000, C=melhor_c).fit(Xs, y)

    modelo_json = json.dumps({
        "geradoEm": date.today().isoformat(),
        "fonte": "GTZAN (1.000 clipes de 30s, 10 generos)",
        "features": colunas,
        "classes": final.classes_.tolist(),
        "media": escalonador.mean_.round(6).tolist(),
        "escala": escalonador.scale_.round(6).tolist(),
        "coeficientes": np.round(final.coef_, 6).tolist(),
        "intercepto": np.round(final.intercept_, 6).tolist(),
        "metricas": {
            "acuraciaHoldout": round(float(holdout), 4),
            "acuraciaCv": round(float(cv.mean()), 4),
            "desvioCv": round(float(cv.std()), 4),
            "baseline": round(1 / len(set(y)), 4),
            "regularizacaoC": melhor_c,
        },
    }, ensure_ascii=False, indent=2)

    # modulo TS em vez de JSON: importavel do Next, do Node e dos scripts sem
    # depender de import attributes nem de resolveJsonModule
    MODELO.write_text(
        "// GERADO POR scripts/treinar_classificador_web.py -- NAO EDITAR A MAO.\n"
        "// Regressao logistica multinomial treinada sobre as features de\n"
        "// src/lib/audio-features.ts extraidas do GTZAN.\n\n"
        "export type GenreModel = {\n"
        "  geradoEm: string;\n"
        "  fonte: string;\n"
        "  features: string[];\n"
        "  classes: string[];\n"
        "  media: number[];\n"
        "  escala: number[];\n"
        "  coeficientes: number[][];\n"
        "  intercepto: number[];\n"
        "  metricas: {\n"
        "    acuraciaHoldout: number;\n"
        "    acuraciaCv: number;\n"
        "    desvioCv: number;\n"
        "    baseline: number;\n"
        "    regularizacaoC: number;\n"
        "  };\n"
        "};\n\n"
        f"export const GENRE_MODEL: GenreModel = {modelo_json};\n",
        encoding="utf-8",
    )

    tamanho = MODELO.stat().st_size / 1024
    print(f"\ngravado {MODELO.relative_to(RAIZ)} ({tamanho:.0f} kB)")


if __name__ == "__main__":
    main()
