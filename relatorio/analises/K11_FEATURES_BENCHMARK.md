# Benchmark: Features de som do essentia.js → `popularity_score`

**Data:** 2026-09-02
**Escopo:** mapear todas as features de áudio que o essentia.js (WASM, MTG/UPF) extrai, classificá-las quanto à utilidade na predição de `popularity_score` no dataset do projeto, e justificar a escolha de **K=11** (10 audio features de Q8 + `mode`) como base do modelo de produção.

---

## 1. Estado do projeto (verificação)

- **Q8** (`relatorio/analises/q8_bayes_hierarquico.py:53-57`) usa exatamente **10 audio features**:
  `danceability, energy, loudness, speechiness, acousticness, instrumentalness, liveness, valence, tempo, explicit`.
  Não inclui `key` nem `mode`.
- **essentia.js ainda não está integrado** ao repo — sem ocorrências em `app/`, `lib/` ou `scripts/`.
- **Artefatos de produção** (`artifacts/feature_names.json`, `artifacts/scaler.json`) já usam K=11 = 10 Q8 + `mode_bin`. Modelo `k11Model.ts` lê esses artefatos.
- **Integração natural**: `app/diagnose/page.tsx` (produto "Diagnóstico de Posicionamento"). Decode mp3 → `MonoMixer` → extractors → JSON. Essentia.js roda **lado cliente (WASM)** ou **lado servidor (Node)** — não roda em Python/Pandas.

---

## 2. K=11 confirmado

| # | Feature | Tipo | Fonte essentia.js |
|---|---|---|---|
| 1 | `danceability` | float 0–1 | `Danceability` (DFA) |
| 2 | `energy` | float 0–1 | `RMS` / `Energy` |
| 3 | `loudness` | float dB | `Loudness` |
| 4 | `speechiness` | float 0–1 | derivado |
| 5 | `acousticness` | float 0–1 | derivado |
| 6 | `instrumentalness` | float 0–1 | derivado |
| 7 | `liveness` | float 0–1 | derivado |
| 8 | `valence` | float 0–1 | derivado |
| 9 | `tempo` | float BPM | `RhythmExtractor` |
| 10 | `explicit` | binário | metadata do track |
| **11** | **`mode`** | **binário 0/1** | **`KeyExtractor.scale` → major=1, minor=0** |

As 10 primeiras espelham as features da Spotify (derivadas do essentia.js em C++ no backend deles). A 11ª, `mode`, é a única adição: preencher com `essentia.KeyExtractor(signal, ...).scale === 'major' ? 1 : 0`.

---

## 3. Catálogo completo do essentia.js (40+ features de som)

### 3.1 Loudness / Dinâmica

| Feature | Algoritmo | Faixa | Intuição p/ popularidade | Recomendação |
|---|---|---|---|---|
| `loudness` (dB) | `Loudness` / `LevelExtractor` / `DynamicComplexity` | −60 a 0 dB | Faixa mais alta = som "pronto pra rádio" | **Já em Q8** |
| `dynamicComplexity` | `DynamicComplexity` | 0–10 | ≈0 = super comprimido (hit pop); alta = dinâmica clássica | **Nova — forte** |
| `strongDecay` | `StrongDecay` | s | "Punch" da mix | **Nova** |
| `loudnessBandRatio` | `BeatsLoudness` | por banda | Distribuição espectral dos beats | **Descartar** (alta dim.) |

### 3.2 Energia / RMS

| Feature | Algoritmo | Faixa | Recomendação |
|---|---|---|---|
| `rms` | `RMS` | 0–1 | **Já em Q8** como `energy` |

### 3.3 Forma Espectral (cor do timbre)

| Feature | Algoritmo | Faixa | Intuição | Recomendação |
|---|---|---|---|---|
| `spectral_centroid` | `Centroid` | Hz | Brilho do som; correlaciona com valence | **Nova** |
| `spectral_spread` | `DistributionShape` | Hz | Largura do espectro | **Nova** |
| `spectral_skewness` | `DistributionShape` | −∞ a +∞ | Assimetria (graves × agudos) | **Nova** |
| `spectral_kurtosis` | `DistributionShape` | 0–∞ | Pontiagudez do espectro | **Nova** |
| `spectral_flatness` | `Flatness` | 0–1 | 1=ruído, 0=tom puro | **Nova** (separa lo-fi × pop) |
| `spectral_flux` | `Flux` | 0–∞ | Mudança frame-a-frame | **Nova** |
| `spectral_rolloff` (85%) | `RollOff` | Hz | Banda abaixo da qual está 85% da energia | **Nova** |
| `hfc` | `HFC` | 0–∞ | Conteúdo agudo | **Nova** |
| `spectral_energy` | `Energy` | 0–∞ | Energia total do frame | **Já em Q8** como `energy` |
| `band_low / mid_low / mid_high / high` | `Energy` por banda | 0–∞ | Distribuição espectral 20–150/150–800/800–4000/4000–20000 Hz | **Nova** (3 Ks substituem 13 MFCCs) |
| `sccoeffs / scvalleys` | `SpectralContrast` | coef | Contraste pico-vale | **Nova** (resumida em 1–2 Ks) |
| `spectral_complexity` | `SpectralComplexity` | 0–∞ | Quantos picos relevantes | **Nova** |

### 3.4 MFCC / BFCC / Mel Bands

| Feature | Algoritmo | Dim | Recomendação |
|---|---|---|---|
| `mfcc` | `MFCC` | 13 | **Descartar** (usar resumo espectral) |
| `bfcc` | `BFCC` | 13 | **Descartar** |
| `melbands` | `MelBands` | 96 | **Descartar** (usar `band_low/mid/high`) |

### 3.5 Dissonância / Harmonicidade

| Feature | Algoritmo | Faixa | Intuição | Recomendação |
|---|---|---|---|---|
| `dissonance` | `Dissonance` | 0–1 | Rugosidade sensorial | **Nova** |
| `inharmonicity` | `Inharmonicity` | 0–1 | 0=puro (sintetizador/voz), 1=percussivo | **Nova** |
| `oddToEvenHarmonicEnergyRatio` | `OddToEvenHarmonicEnergyRatio` | 0–∞ | Predominância ímpar × par (sax × flauta) | **Nova** |
| `tristimulus` | `Tristimulus` | 3 valores | Mistura de harmônicos | **Descartar** (redundante) |

### 3.6 Pitch / Tonal (a fonte de `mode` e `key`)

| Feature | Algoritmo | Faixa | Intuição | Recomendação |
|---|---|---|---|---|
| **`key` (C, C#, …, B)** | `KeyExtractor` | 12 classes | Tom musical da faixa | **Nova — cíclica**: `key_sin`, `key_cos` (2 Ks) |
| **`scale` (major/minor)** | `KeyExtractor` | string | Tom maior × menor — proxy de "humor" | **K=11 — `mode_bin`** |
| `key_strength` | `KeyExtractor` | 0–1 | Confiança na detecção tonal | **Nova** |
| `firstToSecondRelativeStrength` | `Key` | 0–∞ | Razão entre picos do cromagrama | **Descartar** |
| `pitch` (Yin, frame-wise) | `PitchYin` / `PitchYinFFT` | Hz | F0 por frame | **Nova** (resumir em `pitch_mean`, `pitch_std`) |
| `pitchConfidence` | `PitchYin` | 0–1 | "Tem melodia clara × ruído" | **Nova** (`pitch_confidence_mean`) |
| `pitch` (PredominantPitchMelodia) | `PredominantPitchMelodia` | Hz | F0 da melodia predominante | **Nova** (`melodia_pitch_mean`, `melodia_pitch_std`) |
| `hpcp` | `HPCP` | 12 | Cromagrama cru | **Descartar** (usar `key_ciclico_*`) |
| `hpcp_highres` | `HPCP` | 36 | Cromagrama alta resolução | **Descartar** |
| `chords_*` | `ChordsExtractor` | strings +0–1 | Acordes | **Descartar** (custo de decoder alto) |

### 3.7 Ritmo

| Feature | Algoritmo | Faixa | Recomendação |
|---|---|---|---|
| `bpm` | `RhythmExtractor` / `PercivalBpmEstimator` | 40–208 BPM | **Já em Q8** como `tempo` |
| `bpm_estimates / intervals` | `RhythmExtractor2013` | lista | **Descartar** |
| `first_peak_bpm / spread / weight`, `second_peak_*` | `BpmHistogramDescriptors` | BPM / peso | **Nova** (`bpm_histogram_entropy`) |
| `beats_position` | `BeatTracker` | tempos | Resumir em `beat_density_per_sec` |
| `onsetRate` | `OnsetRate` | 0–∞ onsets/s | **Nova** — ortogonal a `tempo`, correlaciona com danceability |
| `confidence` (rítmica) | `RhythmDescriptors` | 0–1 | **Descartar** (metadado de qualidade) |

### 3.8 Zero-crossings

| Feature | Algoritmo | Faixa | Recomendação |
|---|---|---|---|
| `zeroCrossingRate` | `ZeroCrossingRate` | 0–1 | **Nova** (`zcr_mean`) — separa voz × percussão |

### 3.9 Classificadores High-Level

| Feature | Algoritmo | Faixa | Recomendação |
|---|---|---|---|
| `danceability` (DFA) | `Danceability` | 0–3 | **Já em Q8** |
| `intensity` | `Intensity` | −1 / 0 / 1 | **Nova** (relaxed / moderate / aggressive) |

### 3.10 Dinâmica Temporal

| Feature | Algoritmo | Faixa | Recomendação |
|---|---|---|---|
| `TCToTotal` | `TCToTotal` | 0–1 | **Nova** (`tc_to_total`) |
| `duration` | (metadata do arquivo) | s | **Nova** (não vem do essentia) |

---

## 4. Candidatas a extensão do K=11 (priorizadas)

Em ordem de custo computacional vs ganho esperado em `popularity_score`:

| Rank | Feature (Ks adicionais) | Algoritmo essentia.js | Justificativa |
|---|---|---|---|
| 1 | `key_sin`, `key_cos` (+2 Ks) | `KeyExtractor.key` | Tom cíclico — cf. memory `q8-key-feature-problematization` |
| 2 | `dynamic_complexity` (+1 K) | `DynamicComplexity` | Pop comprimido × clássico/ao vivo |
| 3 | `onset_rate` (+1 K) | `OnsetRate` | Densidade de ataques (ortogonal a `tempo`) |
| 4 | `spectral_flatness` (+1 K) | `Flatness` | Ruído × tom puro |
| 5 | `spectral_centroid` (+1 K) | `Centroid` | Brilho |
| 6 | `dissonance` (+1 K) | `Dissonance` | Rugosidade sensorial |
| 7 | `inharmonicity` (+1 K) | `Inharmonicity` | Voz/cordas × percussão |
| 8 | `spectral_flux` (+1 K) | `Flux` | Variabilidade frame-a-frame |
| 9 | `pitch_confidence_mean` (+1 K) | `PitchYin.pitchConfidence.mean()` | Melodia clara × ruído |
| 10 | `zcr_mean` (+1 K) | `ZeroCrossingRate` | Voz × percussão |
| 11 | `band_low / band_mid / band_high` (+3 Ks) | `Energy` por banda | Substitui 13 MFCCs |
| 12 | `key_strength` (+1 K) | `KeyExtractor.strength` | Confiança tonal |

**Total sugerido**: K=11 base + ~9–12 features = **K≈20–23**. O hierárquico Bayesiano comporta, mas a sensibilidade já é grande — o protocolo `q9_dropone_loo_subsample.json` fica ainda mais valioso.

---

## 5. Descartar (custo alto, sinal baixo para popularidade)

- `mfcc` / `bfcc` / `melbands` crus (13/13/96 dimensões — usar resumo)
- `sccoeffs` / `scvalleys` (12+12 — agregar em `spectral_contrast`)
- `chords_*` (custo de decoder alto)
- `hpcp` cru (12 dims — usar `key_ciclico_*`)
- `bpm_estimates`, `bpm_intervals` (redundantes com `tempo`)
- `loudness_band_ratio` (redundante com `loudness` + bandas espectrais)
- `loudness` Steven's power law (manter dB)
- `bpm_confidence` (metadado de qualidade)

---

## 6. Validação empírica

A infraestrutura `q9_dropone_loo_subsample.json` e `q9_dropone_results.json` (no repo, ainda não commitada) já implementa o protocolo drop-one-feature para o hierárquico. É o caminho natural para validar cada candidata acima:

```python
# Pseudo-código do drop-one
for feature in candidates:
    df_drop = df.drop(columns=[feature])
    fit model on df_drop
    compare elpd_loo to baseline
    decide se a feature adiciona sinal
```

---

## 7. Notas de implementação

1. **Lado do essentia.js**: roda em browser (WASM, `app/diagnose/page.tsx`) ou Node (offline batch). O dataset Spotify não traz áudio, só features já calculadas — para o **produto** (input de faixa nova), essentia.js decodifica mp3 e calcula. Para o **dataset de treino**, o Spotify já entrega as 9 audio features (danceability, energy, etc.); só `mode` precisa ser extraído separadamente.
2. **Onde plugar no pipeline Python**: a saída do essentia.js precisa ser carregada de volta para `data/processed/spotify_tracks_limpo.parquet` (chave: `track_id`) para entrar em `q8_bayes_hierarquico.py:130` (`prepare_model_data`).
3. **`mode` é grátis** (já em K=11):
   ```js
   const k = essentia.KeyExtractor(signal, true, 4096, 4096, 12, 3500, 60, 25);
   const mode = k.scale === 'major' ? 1 : 0;
   ```
4. **A próxima expansão natural** do K=11 é adicionar as candidatas do rank 1 (`key_ciclico`) e 2 (`dynamic_complexity`), depois rodar drop-one para validar.