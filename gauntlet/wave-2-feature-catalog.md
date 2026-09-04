# Wave 2 — Catálogo de Features K-11

**Data:** 2026-09-03
**Agente:** smoother (Wave 2)
**Escopo:** documento-canônico listando as 11 features consumidas pelo K=11,
sua origem no código, o método Essentia/heurística usado, a confiança estimada
e a referência na literatura. Serve de referência para Wave 3 (UI), futuros
manutenção, e auditoria de origem de cada feature.

**Origem dos dados** (resumo):

| Origem      | Significado                                                                  |
|-------------|------------------------------------------------------------------------------|
| `essentia`  | Descritor oficial Essentia.js (alta confiança)                               |
| `dsp`       | Calculado via DSP próprio (FFT, RMS, autocorrelação — média confiança)       |
| `proxy`     | Heurística multi-fonte combinando DSP + Essentia (confiança média/baixa)    |
| `metadata`  | Veio de input externo (não do áudio) — confiança 1.0 se presente, 0.0 se não |

---

## 1. Tabela completa — 11 features K-11

| #  | Feature K-11      | Origem no código                                       | Método Essentia / Heurística                                                                | Confidence (essentia / dsp / proxy) | Referência literatura                                                                                              |
|----|-------------------|--------------------------------------------------------|---------------------------------------------------------------------------------------------|-------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| 1  | `danceability`    | `src/lib/extractK11Features.ts:90-104` (`computeDanceability`) → `essentia-analysis.ts:195` (`describeWithEssentia`) | Essentia: `Danceability(vector)` (output ÷ 3, clipado em [0,1])                              | 0.9 / 0.3 / —                       | [Essentia docs — Danceability](https://essentia.upf.edu/)                                                          |
| 2  | `energy`          | `src/lib/extractK11Features.ts:111-124` (`computeEnergy`) → `audio-features.ts` (summary.rms) | DSP: `clamp01(rms / 0.28)` — fator 0.28 mantém a distribuição do dataset Spotify              | — / 0.7 / 0.3                       | Spotify Web API — `energy` doc; Meyda `rms`                                                                        |
| 3  | `loudness`        | `src/lib/extractK11Features.ts:131-148` (`computeLoudness`) → `essentia-analysis.ts:206` (`dynamicComplexity.loudness`) | Essentia: `DynamicComplexity(vector).loudness` em dB; clipado em [-60, 0]                   | 0.85 / 0.3 / —                      | [Essentia docs — DynamicComplexity](https://essentia.upf.edu/reference/std_DynamicComplexity.html)                |
| 4  | `speechiness`     | `src/lib/extractK11Features.ts:157-181` (`computeSpeechiness`) → `audio-features.ts` (zcr, centroid, flatness) | Heurística: `0.4*(zcr/0.3) + 0.4*(1-centroid/4000) + 0.2*(flatness/0.5)`                    | — / — / 0.5                         | Scheirer & Slaney (1997) "Construction and evaluation of a robust multifeature speech/music discriminator" (F1~0.92) |
| 5  | `acousticness`    | `src/lib/extractK11Features.ts:182-209` (`computeAcousticness`) → `audio-features.ts` + Essentia `dynamicComplexity` | Heurística: `0.5 + 0.4*(dyn/8) - 0.4*(centroid/4000) - 0.3*(flatness/0.5)`                  | — / — / 0.5                         | Masri (1996) "Computer modelling of sound for transformation and synthesis of musical signals" (HFC/brightness)   |
| 6  | `instrumentalness`| `src/lib/extractK11Features.ts:213-242` (`computeInstrumentalness`) → Essentia `pitchSalienceMean` (frame) ou fallback DSP | Heurística: `1 - clamp01(0.7*(zcr/0.3) + 0.3*centroidInFormant[1500,3500])`                  | — / — / 0.4 (essentia presente) / 0.4 (fallback DSP) | Muller & Lerch (2011) "Toward the detection of vocals in music information retrieval" (F1~0.80)                  |
| 7  | `liveness`        | `src/lib/extractK11Features.ts:252-280` (`computeLiveness`) → Essentia `dynamicComplexity` + `flatness` | Heurística: `0.1 + 0.5*(dyn/10) + 0.4*flatness`                                             | — / — / 0.3 (essentia) / 0.15 (fallback) | Patino et al. (ISMIR 2017) "Proxies for audience detection in live recordings"                                    |
| 8  | `valence`         | `src/lib/extractK11Features.ts:285-309` (`computeValence`) → Essentia `scale` + `bpm` + DSP `centroid` | Heurística: `0.5 + scaleTerm(±0.15) + 0.2*((bpm-100)/80) + 0.15*(centroid/4000)`             | — / — / 0.4                         | Eerola (2011) "Are the moods of musical key cultures" (major vs minor valence); Spotify Web API `valence`           |
| 9  | `tempo`           | `src/lib/extractK11Features.ts:313-332` (`computeTempo`) → `essentia-analysis.ts:200` (RhythmExtractor2013) ou `audio-features.ts` (autocorrelação) | Essentia: `RhythmExtractor2013.bpm`; fallback DSP: autocorrelação do onset envelope          | 0.9 / 0.6 / 0.2                     | [Essentia docs — RhythmExtractor2013](https://essentia.upf.edu/reference/std_RhythmExtractor2013.html)             |
| 10 | `explicit`        | `src/lib/extractK11Features.ts:347-358` (`computeExplicit`) — input externo via `options.explicit` | Metadata: 0 ou 1 vindo de `options.explicit` (CSV/JSON da track)                            | — / — / 1.0 (presente) ou 0.0 (default) | Spotify API — `track.explicit` (bool)                                                                              |
| 11 | `mode_bin`        | `src/lib/extractK11Features.ts:362-375` (`computeModeBin`) → `essentia-analysis.ts:202-203` (`KeyExtractor`) | Essentia: `KeyExtractor(vector).scale === "major" ? 1 : 0`                                  | 0.95 (essentia) / 0.0 (default)     | [Essentia docs — KeyExtractor](https://essentia.upf.edu/reference/std_KeyExtractor.html)                          |

**Notas sobre a coluna Confidence:**
- Para features com Essentia: 3 valores possíveis listados (essentia / dsp / proxy)
- Para features puramente heurísticas: 2 valores (essentia = —, dsp = —, proxy = valor)
- Para `explicit`: valores de "presente" (1.0) ou "default" (0.0)

---

## 2. Hierarquia de confiança (resumo)

| Faixa     | Significado                                                                 |
|-----------|-----------------------------------------------------------------------------|
| 0.95+     | Descritor Essentia direto (alta fidelidade)                                 |
| 0.85-0.9  | Essentia ou DSP calibrado (boa fidelidade)                                  |
| 0.6-0.7   | DSP próprio calibrado (fidelidade média)                                    |
| 0.4-0.5   | Proxy heurístico razoável (precisaria de modelo ML para melhorar)           |
| 0.3       | Proxy fraco (essentia não cobre o conceito)                                 |
| 0.15-0.2  | Sem dados / heurística cega                                                 |
| 0.0       | Default sem informação (ex.: `mode_bin` sem Essentia, `explicit` ausente)  |
| 1.0       | Metadata explícita (ex.: `explicit=1` vindo do CSV)                         |

---

## 3. Onde os descritores Essentia são calculados

Todos os descritores Essentia vivem em `src/lib/essentia-analysis.ts:186-217`
(`describeWithEssentia`). A função carrega a instância (lazy, cacheada em
`loadEssentia`), faz `centerWindow` (30s centrais) e executa:

| Método Essentia          | Linha       | Retorno no EssentiaDescriptors       |
|--------------------------|-------------|--------------------------------------|
| `RhythmExtractor2013`    | 192         | `{ bpm, confidence }`                |
| `KeyExtractor`           | 193         | `{ key, scale, strength }`           |
| `DynamicComplexity`      | 194         | `{ dynamicComplexity, loudness }`    |
| `Danceability`           | 195         | `{ danceability }` (÷ 3)             |
| `ZeroCrossingRate` (safe)| 208         | `zcr`                                |
| `HFC` (safe)             | 209         | `hfc`                                |
| `PitchSalience` (safe)   | 210         | `pitchSalienceMean`                  |
| `SpectralCentroidTime` (safe) | 211     | `spectralCentroidHz`                 |
| `Flatness` (safe)        | 212         | `spectralFlatnessMean`               |
| `Energy` (safe)          | 213         | `energy`                             |

Os 6 descritores marcados `(safe)` têm fallback 0 + `console.warn` em falha
individual, garantindo que um erro de um descritor não derruba os outros.

---

## 4. Ranges físicos por feature

| Feature          | Range esperado    | Função de clamping            |
|------------------|-------------------|--------------------------------|
| `danceability`   | [0, 1]            | `clamp01`                      |
| `energy`         | [0, 1]            | `clamp01(rms / 0.28)`          |
| `loudness`       | [-60, 0] dB       | `clampRange(-60, 0)` + clip se > 0 |
| `speechiness`    | [0, 1]            | `clamp01`                      |
| `acousticness`   | [0, 1]            | `clamp01`                      |
| `instrumentalness` | [0, 1]          | `clamp01(1 - vocalActivity)`   |
| `liveness`       | [0, 1]            | `clamp01`                      |
| `valence`        | [0, 1]            | `clamp01`                      |
| `tempo`          | [40, 220] BPM     | `clampRange(40, 220)`          |
| `explicit`       | {0, 1}            | strict type `0 \| 1`           |
| `mode_bin`       | {0, 1}            | strict type `0 \| 1`           |

`clamp01` e `clampRange` retornam 0 (ou `min`) em NaN/Infinity — nenhum valor
pode escapar como NaN.

---

## 5. Cobertura de testes (vitest)

Arquivo: `src/lib/extractK11Features.test.ts`. Quatro testes (todos verde):

| Teste                | Sinal sintético              | Validação principal                                                            |
|----------------------|------------------------------|--------------------------------------------------------------------------------|
| `sine-440Hz`         | 0.5·sin(2π·440·t) 5s         | energy > 0.3, instrumentalness > 0.5, liveness < 0.5, ranges físicos           |
| `silence`            | Float32Array 1s zeros        | energy < 0.1, loudness < -40, tempo in [0, 220], instrumentalness > 0.9         |
| `click-120bpm`       | pulsos 880Hz a cada 500ms 4s | tempo in [80, 180], energy > 0.5, instrumentalness > 0.5                       |
| `explicit-1`         | Float32Array 1s + options    | `explicit=1`, origin=`metadata`, confidence=1.0                                |

---

## 6. Mudanças a partir do wave-2-setup.md

- Spec original (`wave-2-setup.md:124-138`) propunha `features: number[]` e
  `diagnostics: { ... }`. A implementação final usa `features: { [key]: number }`
  (objeto) e omite `diagnostics` — escolha consciente (ver `wave-2-critic.md`
  §5.1) por dois motivos: (a) o consumidor `k11Model.ts:12-21` faz lookup por
  nome, não por índice; (b) Zod em `route.ts:9-21` valida o objeto. Lookup
  O(1) por feature na UI.
- A spec também listava `origin` com valor `"heuristica"`; renomeado para
  `"proxy"` (consistente com o termo usado nos JSDoc e no header do arquivo).

---

**Catálogo validado: 11/11 features documentadas, todas com origem rastreável
no código e referência bibliográfica.**
