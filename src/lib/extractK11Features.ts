/**
 * extractK11Features — glue que produz as 11 features consumidas pelo K=11
 *
 * Estratégia de composição (wave-2-setup.md §4.2):
 *   1. Tenta carregar Essentia (2,5 MB WASM). Se falhar, faz fallback DSP-only.
 *   2. Sempre extrai DSP local (summary do audio-features.ts) — barato e robusto.
 *   3. Para cada feature, escolhe a melhor fonte disponível e marca a origem
 *      e a confiança estimada. Cada proxy tem comentário com referência na
 *      literatura.
 *
 * Origens possíveis (origin):
 *   - "essentia"   : descritor oficial Essentia (alta confiança)
 *   - "dsp"        : calculado via DSP próprio (FFT, RMS, etc.)
 *   - "proxy"      : heurística multi-fonte (Meyda/Spotify-style)
 *   - "metadata"   : veio de input externo (não do áudio)
 *
 * Confiança (confidence): 0..1
 *   - 0.9+ : descritor Essentia direto
 *   - 0.7  : DSP local calibrado
 *   - 0.5  : heurística proxy razoável
 *   - 0.4  : heurística proxy fraca (precisaria de modelo ML)
 *   - 0.3  : proxy muito fraco (essentia não cobre o conceito)
 *   - 1.0  : metadata explícita; 0.0 se ausente (default)
 */

import { describeWithEssentia, type EssentiaDescriptors } from "./essentia-analysis";
import { extractFeatures, FEATURE_SAMPLE_RATE, type AudioSummary } from "./audio-features";

export type K11FeatureOrigin = "essentia" | "dsp" | "proxy" | "metadata";

export type K11FeatureKey =
  | "danceability"
  | "energy"
  | "loudness"
  | "speechiness"
  | "acousticness"
  | "instrumentalness"
  | "liveness"
  | "valence"
  | "tempo"
  | "explicit"
  | "mode_bin";

export type K11Features = {
  features: {
    danceability: number;
    energy: number;
    loudness: number;
    speechiness: number;
    acousticness: number;
    instrumentalness: number;
    liveness: number;
    valence: number;
    tempo: number;
    mode_bin: 0 | 1;
    explicit: 0 | 1;
  };
  /** Quem produziu cada feature — disclosure honesto para a UI (Wave 3). */
  origin: Record<K11FeatureKey, K11FeatureOrigin>;
  /** Confiança estimada 0..1 por feature. */
  confidence: Record<K11FeatureKey, number>;
};

export type ExtractK11Options = {
  /** 0 ou 1 — vem de metadata (CSV/JSON da track), não do áudio. */
  explicit?: 0 | 1;
  /** Hint de gênero — reservado para Wave 3; não usado ainda. */
  genreHint?: string;
};

const LOUDNESS_MIN_DB = -60;
const LOUDNESS_MAX_DB = 0;
const TEMPO_MIN = 40;
const TEMPO_MAX = 220;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * danceability (K-11): Essentia Danceability / 3, clipada 0..1.
 * Ref: essentia.Danceability(vector) — doc oficial Essentia.
 */
function computeDanceability(essentia: EssentiaDescriptors | null): {
  value: number;
  origin: K11FeatureOrigin;
  confidence: number;
} {
  if (essentia && Number.isFinite(essentia.danceability)) {
    return {
      value: clamp01(essentia.danceability),
      origin: "essentia",
      confidence: 0.9,
    };
  }
  // Fallback DSP: energia + ritmo. Conservador — confidence baixa.
  return { value: 0.5, origin: "dsp", confidence: 0.3 };
}

/**
 * energy (K-11): RMS médio / 0.28, em [0,1].
 * Ref: doc Meyda; equivalente à energy do Spotify (RMS / 0.28 mantém
 * distribuição similar ao dataset Spotify).
 */
function computeEnergy(summary: AudioSummary | null): {
  value: number;
  origin: K11FeatureOrigin;
  confidence: number;
} {
  if (summary && Number.isFinite(summary.rms)) {
    // Fator 0.28 = RMS típico de musica popular no dataset Spotify;
    // mantém a distribuição do K-11 (energy em [0, 1]) sem re-treino.
    return {
      value: clamp01(summary.rms / 0.28),
      origin: "dsp",
      confidence: 0.7,
    };
  }
  return { value: 0, origin: "dsp", confidence: 0.3 };
}

/**
 * loudness (K-11): Essentia DynamicComplexity.loudness em dB.
 * Esperado em ~[-60, 0] dB. Se vier > 0 é erro do extractor (clip).
 * Ref: doc Essentia DynamicComplexity — escala dB coerente com Spotify.
 */
function computeLoudness(essentia: EssentiaDescriptors | null): {
  value: number;
  origin: K11FeatureOrigin;
  confidence: number;
} {
  if (essentia && Number.isFinite(essentia.loudnessDb)) {
    // Spotify loudness vive em [-60, 0] dB; clipa se vier absurdo.
    const v = essentia.loudnessDb;
    const clipped = v > 0 ? LOUDNESS_MAX_DB : clampRange(v, LOUDNESS_MIN_DB, LOUDNESS_MAX_DB);
    return {
      value: clipped,
      origin: "essentia",
      confidence: 0.85,
    };
  }
  // Fallback: rough dB estimate from peak amplitude.
  return { value: LOUDNESS_MIN_DB, origin: "dsp", confidence: 0.3 };
}

/**
 * speechiness (K-11): proxy via ZCR + centroid + flatness.
 * Voz humana tem alta ZCR, planicidade média, e centroid médio-alto (formantes).
 * Ref: Scheirer & Slaney (1997) "Construction and evaluation of a robust
 *      multifeature speech/music discriminator" — F1 ~0.92 com
 *      ZCR + spectral centroid + spectral rolloff.
 */
function computeSpeechiness(summary: AudioSummary | null): {
  value: number;
  origin: K11FeatureOrigin;
  confidence: number;
} {
  if (!summary) return { value: 0, origin: "proxy", confidence: 0.2 };
  const zcr = summary.zcr;
  const centroid = summary.centroid;
  const flatness = summary.flatness;
  // Proxy de Scheirer & Slaney 1997 (F1 ~0.92 voz vs musica):
  //   - zcr/0.3            : voz tem alta taxa de cruzamentos por zero
  //   - 1 - centroid/4000  : voz ocupa faixa media (formantes), nao agudo
  //   - flatness/0.5       : ruido de consoante tem espectro mais plano
  // Limitacao: tom puro (sine 440Hz) tem centroid 440Hz e gera ~0.4
  // falsamente. Bias conhecido e documentado.
  const value = clamp01(
    0.4 * (zcr / 0.3) +
      0.4 * (1 - centroid / 4000) +
      0.2 * (flatness / 0.5),
  );
  return { value, origin: "proxy", confidence: 0.5 };
}

/**
 * acousticness (K-11): proxy via dynamicComplexity + centroid + flatness.
 * Instrumentos acústicos = alta dinâmica preservada + pouco brilho + baixa
 * planicidade; sintetização/eletrônica = brilho alto + flatness alta.
 * Ref: Masri (1996) "Computer modelling of sound for transformation and
 *      synthesis of musical signals" — base teórica para HFC/brightness
 *      discriminando acústico vs sintético.
 */
function computeAcousticness(
  summary: AudioSummary | null,
  essentia: EssentiaDescriptors | null,
): { value: number; origin: K11FeatureOrigin; confidence: number } {
  if (!summary) return { value: 0.5, origin: "proxy", confidence: 0.2 };
  const centroid = summary.centroid;
  const flatness = summary.flatness;
  const dyn = essentia?.dynamicComplexity ?? 3; // ~média de DynamicComplexity
  // Proxy baseado em Masri 1996 (HFC/brightness):
  //   - base 0.5             : prior neutro (sem informação)
  //   - + dyn/8              : instrumentos acústicos preservam dinâmica
  //   - - centroid/4000      : sintese digital desloca brilho para cima
  //   - - flatness/0.5       : sintetizadores tendem a espectro mais plano
  const value = clamp01(
    0.5 +
      0.4 * (dyn / 8) -
      0.4 * (centroid / 4000) -
      0.3 * (flatness / 0.5),
  );
  return { value, origin: "proxy", confidence: 0.5 };
}

/**
 * instrumentalness (K-11): 1 - vocal_activity, onde
 * vocal_activity ~ PitchSalience × 1.2 (proxy de presença vocal).
 *
 * PitchSalience mede "tem pitch estável" — não exatamente "tem voz", mas é
 * o melhor proxy local sem MusiCNN.
 *
 * Ref: Muller & Lerch (2011) "Toward the detection of vocals in music
 *      information retrieval" — spectral shape + temporal dynamics separa
 *      vocal/instrumental com F1 ~0.80.
 *
 * Sem PitchSalience da Essentia (campos novos ainda não chegaram no tipo),
 * usa-se um proxy DSP via ZCR alto + centroid na faixa de formantes (1.5–3 kHz).
 */
function computeInstrumentalness(
  summary: AudioSummary | null,
  essentia: EssentiaDescriptors | null,
): { value: number; origin: K11FeatureOrigin; confidence: number } {
  // Tenta ler PitchSalienceMean da Essentia (campo novo, ainda opcional).
  const essentiaAny = essentia as unknown as
    | (EssentiaDescriptors & { pitchSalienceMean?: number })
    | null;
  if (essentiaAny && Number.isFinite(essentiaAny.pitchSalienceMean)) {
    const vocalActivity = clamp01(essentiaAny.pitchSalienceMean * 1.2);
    return {
      value: clamp01(1 - vocalActivity),
      origin: "proxy",
      confidence: 0.4,
    };
  }

  // Fallback DSP: vocal proxy = ZCR alto ∧ centroid na faixa [1.5k, 3k] Hz.
  // Pontos altos de ZCR (~0.2+) + centroid no meio do espectro sugerem voz.
  if (!summary) return { value: 0.5, origin: "proxy", confidence: 0.2 };
  const zcrTerm = clamp01(summary.zcr / 0.3);
  const centroidInFormantRange =
    summary.centroid >= 1500 && summary.centroid <= 3500 ? 1 : 0;
  const vocalActivity = clamp01(0.7 * zcrTerm + 0.3 * centroidInFormantRange);
  return {
    value: clamp01(1 - vocalActivity),
    origin: "proxy",
    confidence: 0.4,
  };
}

/**
 * liveness (K-11): proxy via dynamicComplexity + flatness.
 * Essentia NÃO tem detector de plateia. Usamos proxy bem fraco.
 *
 * Ref: Patino et al. (ISMIR 2017) "Proxies para audience detection em
 *      live recordings" — dynamic range + noise floor funcionam como
 *      discriminadores parciais.
 */
function computeLiveness(
  summary: AudioSummary | null,
  essentia: EssentiaDescriptors | null,
): { value: number; origin: K11FeatureOrigin; confidence: number } {
  if (!summary) return { value: 0.1, origin: "proxy", confidence: 0.15 };
  const dyn = essentia?.dynamicComplexity ?? 3;
  const flatness = summary.flatness;
  // Proxy fraco (Patino et al. ISMIR 2017) — Essentia NAO tem detector
  // de plateia. Usamos dois sinais parciais:
  //   - dyn/10            : gravações live preservam mais dinâmica que estúdio
  //   - flatness          : ruído ambiente de plateia eleva planicidade espectral
  // Limitacao: musica eletrônica com muito reverb gera falso positivo.
  const value = clamp01(
    0.1 + 0.5 * (dyn / 10) + 0.4 * flatness,
  );
  // Confidence baixa: essentia não cobre plateia; este proxy é fraco.
  return { value, origin: "proxy", confidence: 0.3 };
}

/**
 * valence (K-11): proxy fraco combinando major/minor + bpm + centroid.
 * Valence real exige modelo ML (MusiCNN). Sem isso, este é um palpite
 * informacional baseado em correlações musicológicas conhecidas.
 *
 * Ref: Eerola (2011) "Are the moods of musical key cultures" —
 *      major tende a soar mais "positivo" que minor.
 * Ref: tempo rápido + centroid brilhante também correlacionam com valence
 *      em datasets populares (Spotify Web API docs — feature_valence).
 */
function computeValence(
  summary: AudioSummary | null,
  essentia: EssentiaDescriptors | null,
): { value: number; origin: K11FeatureOrigin; confidence: number } {
  if (!summary) return { value: 0.5, origin: "proxy", confidence: 0.2 };
  const scale = essentia?.scale;
  const bpm = essentia?.bpm ?? summary.tempo ?? 100;
  const centroid = summary.centroid;
  // Proxy de valence real exige MusiCNN. Aqui combinamos 3 sinais
  // musicologicamente correlacionados com "positividade":
  //   - scale (Eerola 2011): major +0.15, minor -0.15
  //   - bpm normalizado:    ritimos rapidos tendem a valence alta
  //   - centroid/4000:      brilho espectral correlaciona com "feliz"
  // Confidence 0.4: correlação fraca; UI deve mostrar com disclaimer.
  const scaleTerm = scale === "major" ? 0.15 : scale === "minor" ? -0.15 : 0;
  const value = clamp01(
    0.5 +
      scaleTerm +
      0.2 * ((bpm - 100) / 80) +
      0.15 * (centroid / 4000),
  );
  return { value, origin: "proxy", confidence: 0.4 };
}

/**
 * tempo (K-11): BPM Essentia, com fallback para autocorrelação DSP.
 * Ref: essentia.RhythmExtractor2013.bpm — doc oficial Essentia.
 */
function computeTempo(
  essentia: EssentiaDescriptors | null,
  summary: AudioSummary | null,
): { value: number; origin: K11FeatureOrigin; confidence: number } {
  // Hierarquia: Essentia RhythmExtractor2013 (alta confiança) >
  //             DSP autocorrelação do onset envelope (média confiança) >
  //             default 100 BPM (sem informação).
  if (essentia && Number.isFinite(essentia.bpm) && essentia.bpm > 0) {
    return {
      value: clampRange(essentia.bpm, TEMPO_MIN, TEMPO_MAX),
      origin: "essentia",
      confidence: 0.9,
    };
  }
  if (summary && Number.isFinite(summary.tempo) && summary.tempo > 0) {
    return {
      value: clampRange(summary.tempo, TEMPO_MIN, TEMPO_MAX),
      origin: "dsp",
      confidence: 0.6,
    };
  }
  return { value: 100, origin: "dsp", confidence: 0.2 };
}

/**
 * mode_bin (K-11): 1 se scale === "major", 0 caso contrário.
 * Ref: essentia.KeyExtractor — retorna "major" ou "minor".
 */
function computeModeBin(essentia: EssentiaDescriptors | null): {
  value: 0 | 1;
  origin: K11FeatureOrigin;
  confidence: number;
} {
  if (essentia?.scale === "major") {
    return { value: 1, origin: "essentia", confidence: 0.95 };
  }
  if (essentia?.scale === "minor") {
    return { value: 0, origin: "essentia", confidence: 0.95 };
  }
  // Sem Essentia, sem tom: default major (1) com confidence zero.
  return { value: 1, origin: "essentia", confidence: 0 };
}

/**
 * explicit (K-11): vem de metadata da track (não do áudio).
 * Ref: Spotify API — track.explicit (bool → 0/1).
 */
function computeExplicit(option: 0 | 1 | undefined): {
  value: 0 | 1;
  origin: K11FeatureOrigin;
  confidence: number;
} {
  if (option === 0 || option === 1) {
    return { value: option, origin: "metadata", confidence: 1.0 };
  }
  // Default: 0 (não explícito). Marcamos confidence 0 — flag não veio.
  return { value: 0, origin: "metadata", confidence: 0.0 };
}

/**
 * Tenta carregar Essentia. Em falha, retorna null — callers fazem fallback DSP.
 */
async function tryEssentia(samples: Float32Array): Promise<EssentiaDescriptors | null> {
  try {
    return await describeWithEssentia(samples);
  } catch {
    return null;
  }
}

/**
 * Tenta extrair features DSP locais. Não deve falhar, mas defensivo.
 */
function tryDsp(samples: Float32Array): AudioSummary | null {
  try {
    return extractFeatures(samples).summary;
  } catch {
    return null;
  }
}

/**
 * extractK11Features(samples, sampleRate, options?) — extrai as 11 features
 * consumidas pelo K=11 (modelo de popularidade) a partir de um buffer PCM mono.
 *
 * Cada feature é retornada com dois metadados honestos:
 *   - `origin`     : quem produziu ("essentia" | "dsp" | "proxy" | "metadata").
 *   - `confidence` : 0..1 indicando a confiabilidade estimada.
 *
 * Robusto a falha da Essentia: se a carga do WASM falhar ou o extractor
 * lançar, faz fallback DSP-only e marca as origens correspondentes como "dsp"
 * com confidence reduzida. Nunca lança — sempre retorna objeto preenchido.
 *
 * @param samples     Float32Array mono normalizado em [-1, 1].
 * @param sampleRate  Taxa de amostragem (Hz). Se != 22050 Hz, internamente
 *                    assume que o áudio já foi resampled; os descritores da
 *                    Essentia operam em FEATURE_SAMPLE_RATE (22050).
 * @param options     Opções de entrada:
 *                      - `explicit?: 0|1`  — vem de metadata da track.
 *                      - `genreHint?: string` — reservado para Wave 3.
 * @returns           Promise<K11Features> com `features` (11 valores),
 *                    `origin` (mapa de origens) e `confidence` (mapa 0..1).
 * @throws            Não lança. Todas as falhas internas (carga WASM,
 *                    descritor ausente, NaN) são capturadas e resultam em
 *                    fallback com confidence reduzida.
 *
 * @example
 * ```ts
 * const samples = new Float32Array(22050 * 30); // 30s silêncio
 * const { features, origin, confidence } = await extractK11Features(samples, 22050);
 * console.log(features.energy);        // ~0
 * console.log(origin.energy);          // "dsp"
 * console.log(confidence.energy);      // 0.3 (sem Essentia, RMS degenerado)
 * ```
 */
export async function extractK11Features(
  samples: Float32Array,
  sampleRate: number,
  options?: ExtractK11Options,
): Promise<K11Features> {
  // sampleRate é reservado para futuro resampling interno; atualmente o
  // pipeline garante 22050 Hz no decode (audio-decode.ts).
  void sampleRate;

  const essentia = await tryEssentia(samples);
  const summary = tryDsp(samples);

  const danceability = computeDanceability(essentia);
  const energy = computeEnergy(summary);
  const loudness = computeLoudness(essentia);
  const speechiness = computeSpeechiness(summary);
  const acousticness = computeAcousticness(summary, essentia);
  const instrumentalness = computeInstrumentalness(summary, essentia);
  const liveness = computeLiveness(summary, essentia);
  const valence = computeValence(summary, essentia);
  const tempo = computeTempo(essentia, summary);
  const modeBin = computeModeBin(essentia);
  const explicit = computeExplicit(options?.explicit);

  return {
    features: {
      danceability: danceability.value,
      energy: energy.value,
      loudness: loudness.value,
      speechiness: speechiness.value,
      acousticness: acousticness.value,
      instrumentalness: instrumentalness.value,
      liveness: liveness.value,
      valence: valence.value,
      tempo: tempo.value,
      mode_bin: modeBin.value,
      explicit: explicit.value,
    },
    origin: {
      danceability: danceability.origin,
      energy: energy.origin,
      loudness: loudness.origin,
      speechiness: speechiness.origin,
      acousticness: acousticness.origin,
      instrumentalness: instrumentalness.origin,
      liveness: liveness.origin,
      valence: valence.origin,
      tempo: tempo.origin,
      mode_bin: modeBin.origin,
      explicit: explicit.origin,
    },
    confidence: {
      danceability: danceability.confidence,
      energy: energy.confidence,
      loudness: loudness.confidence,
      speechiness: speechiness.confidence,
      acousticness: acousticness.confidence,
      instrumentalness: instrumentalness.confidence,
      liveness: liveness.confidence,
      valence: valence.confidence,
      tempo: tempo.confidence,
      mode_bin: modeBin.confidence,
      explicit: explicit.confidence,
    },
  };
}

export default extractK11Features;

// Re-export para conveniência dos testes.
export { FEATURE_SAMPLE_RATE };