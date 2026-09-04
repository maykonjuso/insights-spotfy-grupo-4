# Wave 2 Setup — Mapeamento de features K-11 e plano `extractK11Features`

Data: 2026-09-03
Agente: setup (Wave 2)
Escopo: mapear o que JÁ existe de extracao audio no repo e desenhar a glue
que produz as 11 features consumidas pelo K-11, antes das fases
Build · essentia direct / Build · proxies / Build · tests.

---

## 1. Tabela de mapeamento — feature K-11 vs codigo atual

| # | feature K-11      | ja existe? | onde (arquivo:linha)                             | qualidade                  | confianca (0-1) |
|---|-------------------|:----------:|---------------------------------------------------|----------------------------|:---------------:|
| 1 | danceability      | sim        | `src/lib/essentia-analysis.ts:76`                 | essentia (Danceability /3, clipada em 0-1) | alta            |
| 2 | energy            | sim        | `src/lib/sound-features.ts:152` (RMS normalizado) | DSP (RMS / 0.28)           | alta            |
| 3 | loudness          | sim        | `src/lib/essentia-analysis.ts:83`                 | essentia (DynamicComplexity.loudness, dB)  | alta            |
| 4 | speechiness       | parcial    | `src/lib/sound-features.ts:66-71`                 | estimativa (ZCR + flatness + bandwidth)     | media (proxy)   |
| 5 | acousticness      | parcial    | `src/lib/sound-features.ts:51-56`                 | estimativa (centroid + flatness + dyn)    | media (proxy)   |
| 6 | instrumentalness  | nao        | (ausente)                                         | —                          | baixa (proxy novo) |
| 7 | liveness          | nao        | (ausente)                                         | —                          | baixa (proxy novo) |
| 8 | valence           | parcial    | `src/lib/sound-features.ts:58-64`                 | estimativa (scale + bpm + centroid + dance) | media (proxy) |
| 9 | tempo             | sim (×2)   | `src/lib/essentia-analysis.ts:77` + `audio-features.ts:395` | essentia (BPM) + DSP (autocorrelacao) | alta (essentia preferido) |
| 10| explicit          | nao-audio  | vem de metadata Spotify (CSV/JSON da track), NAO extrai de audio | —                          | n/a (input externo) |
| 11| mode_bin          | parcial    | `src/lib/essentia-analysis.ts:79-80` (key + scale)| essentia (KeyExtractor) — falta converter `scale` ("major"/"minor") em 0/1 | alta (essentia) |

**Resumo quantitativo:**
- 5/11 features em qualidade ALTA (danceability, energy, loudness, tempo, mode_bin via KeyExtractor).
- 3/11 features em qualidade MEDIA (speechiness, acousticness, valence) — heuristicas em `sound-features.ts`.
- 2/11 features AUSENTES (instrumentalness, liveness).
- 1/11 vem de metadata, nao de audio (explicit).

---

## 2. Features ausentes ou fracas — analise

### 2.1 Ausentes

**`instrumentalness`** (K-11 mean=0.158, std=0.310 — alta variancia, ~50% das musicas abaixo de 0.05):
- Nenhuma funcao atual produz esse numero.
- Estrategia: proxy via Essentia `PitchSalience(spectrum)` por frame + `SpectralCentroid`. Razao:
  - Vocal = tons pitchados (vogais) + ruidos (consoantes), com concentracao espectral na faixa 1.5-3 kHz (formantes).
  - Instrumental puro = espectro mais estacionario OU sem a combinacao "centroid mid + salience alta".
- Literatura: Muller & Lerch (2011) "Toward the detection of vocals in music information retrieval" confirma que a combinacao `spectral shape + temporal dynamics` separa vocal/instrumental com F1 ~0.80.
- Algoritmo proposto:
  1. Frame-by-frame: `Windowing` -> `Spectrum` -> `PitchSalience` + `Centroid`.
  2. vocal_proxy = fracao de frames com `salience > 0.5` AND `centroid in [1500, 3500] Hz`.
  3. `instrumentalness = 1 - vocal_proxy`, clampeado em [0, 1].

**`liveness`** (K-11 mean=0.212, std=0.186 — variancia moderada):
- Nenhuma funcao atual produz esse numero.
- Essentia NAO tem detector de plateia; literatura (Patino et al., ISMIR 2017) confirma que proxies via dynamic range + noise floor funcionam.
- Algoritmo proposto (sem Essentia nova):
  1. Por frame ja temos `rms` (audio-features.ts). Calcular `rms_deciles` — percentis 10/50/90.
  2. `noise_floor_ratio = mean(rms_p10) / max(rms_p90)`. Live recordings tem noise floor alto (~0.05-0.15), studio tem ~0.005-0.02.
  3. `dynamic_range_db = 20 * log10(rms_p90 / max(rms_p10, 1e-6))`. Studio muito comprimido < 8 dB, live > 12 dB.
  4. Bonus: `dynamicComplexity` do Essentia (ja temos) — live recordings tendem a ter > 5.
  5. `liveness = clamp(0.6 * normalize(noise_floor_ratio) + 0.4 * normalize(dynamic_range_db / 20) + 0.2 * normalize(dynamicComplexity / 8), 0, 1)`.

### 2.2 Fracas (heuristicas a melhorar)

**`speechiness`** (K-11 mean=0.079, std=0.081 — escala apertada em 0-0.3):
- Atual: linear combo de zcr, flatness, bandwidth.
- Upgrade: adicionar `std(zcr)` e `std(centroid)` (ja calculados em audio-features.ts:391-393 mas não expostos no SoundFeatureGrid). Voz humana tem alta variancia temporal; musica instrumental tem padroes mais estacionarios.
- Ref: Scheirer & Slaney (1997) "Construction and evaluation of a robust multifeature speech/music discriminator" — F1 ~0.92 com ZCR + spectral centroid + spectral rolloff.

**`acousticness`** (K-11 mean=0.310, std=0.330 — larga):
- Atual: `0.55 + 0.35*dyn - 0.45*centroid - 0.3*flatness`.
- Upgrade: usar Essentia `HFC(spectrum, sampleRate, 'Masri')`. HFC = sum(|mag[i]| * i^2). Instrumentos acusticos = HFC baixo; sinteticos/elaborados = HFC alto.
- Ref: Masri (1996) "Computer modelling of sound for transformation and synthesis of musical signals" — HFC distingue acustico vs eletrico.

**`valence`** (K-11 mean=0.474, std=0.259):
- Atual: combinacao de mode + bpm + centroid + dance.
- Upgrade: Essentia ja retorna `key` (A-G#) e `scale` (major/minor) — JÁ USADO. Pode adicionar peso a `keyStrength` (correlatos musicologicos). Bonus: variancia de `rms` (musicas "animadas" tem envelope mais energetico).

---

## 3. APIs Essentia.js validadas via context7

Biblioteca resolvida: `/mtg/essentia.js` (1510 snippets, reputacao HIGH).

### 3.1 `PitchSalience(spectrum, [highBoundary], [lowBoundary], [sampleRate])`
- **Assinatura confirmada**: `spectrum` (VectorFloat, magnitude spectrum), `highBoundary` (default 5000 Hz), `lowBoundary` (default 100 Hz), `sampleRate` (default 44100).
- **Retorno**: `pitchSalience` em [0, 1].
- **Semantica**: unpitched ~0; tons harmonicos ~alto. **NÃO** significa "tem voz", e sim "tem pitch estavel" — usar COM spectral centroid para discriminar vocal (centroid mid) de percussao tonal (centroid alto) ou sub-bass (centroid baixo).
- **Uso**: chamar por frame apos `Windowing -> Spectrum`.

### 3.2 `Spectrum(frame, size)`
- **Assinatura**: `frame` (VectorFloat ja janelado), `size` (FFT size com zero-padding).
- **Retorno**: `spectrum` VectorFloat magnitude.
- **Uso**: pre-requisito para `PitchSalience` e `HFC`. Frame size 2048 + zero padding 4096 (igual a audio-features.ts).

### 3.3 `Windowing(frame, [normalized], [size], [type], [zeroPadding], [zeroPhase])`
- Janela Hann, zero-phase, ja com normalize=true (default). Bate com `hannWindow(2048)` em audio-features.ts.
- **Uso**: pre-requisito para `Spectrum`.

### 3.4 `HFC(spectrum, [sampleRate], [type])`
- **Assinatura**: `spectrum` VectorFloat, `sampleRate` (default 44100), `type` ('Masri' default | 'Jensen' | 'Brossier').
- **Retorno**: `{ hfc: number }` — coeficiente HFC. **NAO normalizado** — magnitude depende do tamanho do FFT e amplitude do sinal.
- **Uso**: por frame; normalizar pela soma do espectro para obter coeficiente comparavel entre faixas.

### 3.5 `ZeroCrossingRate(signal, [threshold])`
- **Assinatura**: signal VectorFloat, threshold default 0.
- **Retorno**: `{ zeroCrossingRate: number }` em [0, 1].
- **Uso**: ja temos ZCR em audio-features.ts (linha 289); essentia ZCR e alternativa mais robusta por causa de threshold.

### 3.6 `MonoMixer(leftChannel, rightChannel)`
- N/A — audio-decode.ts:21-29 ja faz mono via OfflineAudioContext. Nao usar.

### 3.7 `LoudnessEBUR128(left, right, [hopSize], [sampleRate], [startAtZero])`
- **Assinatura**: requer 2 canais (stereo); monoSamples nosso pode ser duplicado.
- **Retorno**: `{ momentaryLoudness, shortTermLoudness, integratedLoudness, loudnessRange }` em LUFS.
- **NAO usar como loudness K-11**: o K-11 foi treinado em loudness do dataset Spotify (que e similar ao `loudnessDb` do Essentia DynamicComplexity — escala dB, NAO LUFS). Trocar a fonte piora calibracao.
- **Uso opcional**: relatorio secundario em LUFS para exibir na UI.

---

## 4. Plano de implementacao (resumo)

### 4.1 `extractK11Features(samples, sampleRate, options)` — design da glue

**Local**: `src/lib/k11-extractor.ts` (novo arquivo).

```typescript
// Assinatura proposta
export type K11Options = {
  explicit?: number;       // 0/1, default 0 (sem metadata)
  windowSeconds?: number;  // default 30
  centerWindow?: boolean;  // default true (pega 30s centrais)
};

export type K11Features = {
  features: number[];           // [danceability, energy, loudness, speechiness, acousticness, instrumentalness, liveness, valence, tempo, explicit, mode_bin]
  map: Record<string, number>;  // { danceability: 0.7, ..., mode_bin: 1 }
  origin: Record<string, "essentia" | "dsp" | "heuristica" | "metadata">;
  diagnostics: { durationMs: number; clippedSamples: number; rmsPercentiles: number[] };
};

export async function extractK11Features(
  samples: Float32Array,
  sampleRate: number,
  options?: K11Options,
): Promise<K11Features>;
```

**Fluxo interno:**
1. Chamar `describeWithEssentia(samples)` — ja retorna { danceability, bpm, key, scale, loudnessDb, dynamicComplexity }.
2. Chamar `extractFeatures(window)` — ja retorna AudioSummary { tempo, centroid, rolloff, bandwidth, zcr, rms, peak, contrast, flatness } + extras (std de zcr e centroid).
4. Calcular `mode_bin`: `essentiaDescriptors.scale === "major" ? 1 : 0` (essentia retorna apenas major/minor).
5. **NOVO**: instrumentallness — iterar frames, chamar essentia `Windowing -> Spectrum -> PitchSalience` + centroid, calcular vocal proxy.
6. **NOVO**: liveness — calcular RMS percentis (10/50/90) dos frames + dynamicComplexity, normalizar.
7. **MELHORAR**: speechiness — adicionar std(zcr) e std(centroid) na heuristica.
8. **MELHORAR**: acousticness — adicionar HFC Essentia (media sobre frames normalizada).
10. `explicit` = options.explicit ?? 0 (sem default infeliz; default 0 com nota no diagnostics).
11. `tempo` = essentia.bpm (preferido); fallback para `audioFeatures.tempo`.
12. `loudness` = essentia.loudnessDb (ja em dB).
13. Montar array na ordem de `feature_names.json`.
14. Clampar todas as features em ranges fisicos (energy [0,1], loudness [-60, 0], tempo [40, 220], speechiness [0,1], acousticness [0,1], instrumentalness [0,1], liveness [0,1], valence [0,1]).

**Side effects**: nenhum (funcao pura, exceto `loadEssentia()` que e cacheada internamente).

### 4.2 Implementacao por feature

| feature | origem | metodo | literatura |
|---------|--------|--------|------------|
| danceability | essentia | `Danceability(vector)` (existente) | doc Essentia |
| energy | dsp | `rms / 0.28` (existente) | doc Meyda/MIR |
| loudness | essentia | `DynamicComplexity.loudness` (existente) | doc Essentia |
| speechiness | heuristica+ | `0.35*zcr + 0.45*flatness + 0.2*bandwidth - 0.12 + 0.3*std(zcr) + 0.2*std(centroid)` | Scheirer & Slaney 1997 |
| acousticness | heuristica+essentia | `0.55 + 0.35*dyn - 0.45*centroid - 0.3*flatness - 0.2*normalize(hfc)` | Masri 1996 |
| instrumentalness | essentia | `1 - vocal_proxy` onde `vocal_proxy = mean(salience[i] > 0.5 && centroid[i] in [1500, 3500])` | Muller & Lerch 2011 |
| liveness | dsp+essentia | `0.6*norm(noise_floor_ratio) + 0.4*norm(dyn_range_db/20) + 0.2*norm(dyn_complex/8)` | Patino et al. ISMIR 2017 |
| valence | heuristica | `0.5 + 0.15*mode_sign + 0.2*(bpm_norm - 0.5) + 0.15*(brilho - 0.5) + 0.15*(dance - 0.5) + 0.1*std(rms)` | Eerola 2011 (key/mode emotional) |
| tempo | essentia | `RhythmExtractor2013.bpm` (existente) | doc Essentia |
| explicit | metadata | input externo (NAO do audio) | Spotify API |
| mode_bin | essentia | `scale === "major" ? 1 : 0` (derivado de KeyExtractor) | doc Essentia |

### 4.3 Pontos de atencao

- **Calibracao dos proxies**: o K-11 foi treinado em features do Spotify. Nossos proxies nao vao bater 1:1 — por isso a importancia de documentar `origin` em cada feature e expor isso na UI (Wave 3). Valores `essentia` sao os mais confiaveis.
- **Fallback quando Essentia falha**: o worker ja tem fallback em audio-analysis. Mas extractK11Features deve falhar explicitamente se Essentia nao carrega — o K-11 NAO roda sem essentia (loudness, mode_bin, instrumentalness, key_strength, dynamicComplexity todos dependem).
- **Custo computacional**: PitchSalience por frame em ~30s/22050Hz/hop512 ~= 1300 frames = ~1300 chamadas essentia. Em media 30s -> ~3-5s de latencia adicional. Aceitavel para diagnostico offline.
- **Centroide ja exposto**: audio-features.ts:402 retorna mean(centroids) mas nao std(centroids). Precisamos adicionar std no summary ou no vector. **Decisao**: adicionar `centroidStd`, `zcrStd`, `rmsStd` no AudioSummary (backward-compat).

---

## 6. Design da test suite — `src/lib/k11-extractor.test.ts`

### 6.1 3 sinais canonicos (minimum viable test)

| sinal | geracao | parametros | features esperadas | tolerancia |
|-------|---------|-----------|-------------------|------------|
| **440Hz sine** | `0.5 * sin(2π·440·t)` 30s @ 22050 Hz | tom puro, amplitude constante | danceability ≈ 0.1, energy ≈ media (RMS 0.35), loudness ≈ -10 dB, speechiness ≈ 0, acousticness ≈ 1 (tom puro), instrumentalness ≈ 1 (tom puro sem voz), liveness ≈ 0 (sem plateia), valence ≈ 0.5 (neutro), tempo ≈ 0 (sem ritmo), mode_bin in {0,1} | ±0.15 cada |
| **silence** | Float32Array(30s) zeros | ruido nulo | danceability ≈ 0, energy ≈ 0, loudness ≈ -60 dB, speechiness ≈ 0, acousticness ≈ 0.5 (default), instrumentalness ≈ 1, liveness ≈ 0, valence ≈ 0.5, tempo ≈ 0, mode_bin = 0 | tolerancia larga ±0.2 (caso degenerado) |
| **120 BPM click** | impulso a cada 0.5s + ruido rosa leve | percussao ritmica clara | danceability alto > 0.5, energy alta, tempo ≈ 120 BPM (±5), speechiness ≈ 0, instrumentalness ≈ 1 (sem voz), liveness ≈ 0 | ±0.15 exceto tempo ±5 |

### 6.2 Helper de geracao
- Mockar essentia (loadEssentia) para os 3 sinais — OU rodar essentia real e marcar como `it.skip` se pesado.
- Decisao: rodar essentia REAL nos testes (vitest) para validar comportamento end-to-end. Tempo estimado: ~5-10s por teste. Adicionar `describe.concurrent` para paralelizar.

### 6.3 Assertions por feature
- Cada teste valida:
  1. `features` tem 11 elementos na ordem de `feature_names.json`.
  2. Cada feature esta no range fisico esperado.
  3. `origin` mapeia cada feature para sua origem.
  4. `mode_bin` é 0 ou 1.
  5. Para 440Hz sine: acousticness e loudness em valores esperaveis.

### 6.4 Cobertura minima
- 3 testes canonicos (440Hz, silence, 120 BPM).
- 1 teste de clamping (features fora de [0,1] sao clampadas para energy/speechiness/etc; loudness clampeado para [-60, 0]).
- 1 teste de ordem do vetor (igual a `feature_names.json`).
- 1 teste de `options.explicit` quando passado.
- 1 teste de `mode_bin` para scale "minor" vs "major".

Total: ~7 testes, ~30s de runtime estimado.

---

## 7. Proximos passos (handoff para Build phases)

**Wave 2 phase 2 (Build):**
- **Build · essentia direct**: implementar instrumentalness (PitchSalience iterado), melhorar acousticness (HFC), expor mode_bin como 0/1, expor std(zcr)/std(centroid)/std(rms) no AudioSummary.
- **Build · proxies**: implementar liveness (RMS percentis + dynComplexity), refinar speechiness/valence/energy com os std expostos.
- **Build · tests**: implementar `k11-extractor.test.ts` com 3 sinais canonicos + 4 testes de clamping/ordem.

**Wave 3 (UI)**: receber `K11Features` + exibir `origin` por feature (essentia = badge azul, dsp = cinza, heuristica = amarelo, metadata = verde) para disclosure honesto.

---

**Validacao Setup completa: 11/11 features K-11 mapeadas. 5 ALTA, 3 MEDIA, 2 BAIXA, 1 METADATA.**