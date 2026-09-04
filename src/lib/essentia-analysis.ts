import type Essentia from "essentia.js/dist/essentia.js-core.es.js";
import { FEATURE_SAMPLE_RATE } from "./audio-features";

export type EssentiaDescriptors = {
  danceability: number;
  bpm: number;
  bpmConfidence: number;
  key: string;
  scale: string;
  keyStrength: number;
  dynamicComplexity: number;
  loudnessDb: number;
  // Wave 2 / K-11 extras — cada um tem fallback 0 se o metodo falhar.
  zcr: number;
  hfc: number;
  pitchSalienceMean: number;
  spectralCentroidHz: number;
  spectralFlatnessMean: number;
  energy: number;
};

// A Essentia e o mesmo motor usado em scripts/classificar_genero.py; aqui ela
// roda em WebAssembly, entao os descritores da tela batem com os do pipeline
// offline. O bundle tem ~2,5 MB, por isso o import e dinamico.
let instance: Promise<Essentia> | null = null;

// O build web da essentia.js foi compilado com ENVIRONMENT=web fixo: dentro de
// um Web Worker ele cai no ramo que le document.currentScript, que nao existe
// ali, e o modulo nem chega a carregar. Como passamos locateFile, o valor lido
// e irrelevante -- basta o objeto existir. Na thread principal isso e no-op.
function ensureDocumentShim() {
  const scope = globalThis as { document?: unknown };
  if (typeof scope.document === "undefined") {
    scope.document = { currentScript: null };
  }
}

async function loadEssentia() {
  if (!instance) {
    instance = (async () => {
      ensureDocumentShim();
      const [wasm, core] = await Promise.all([
        import("essentia.js/dist/essentia-wasm.web.js"),
        import("essentia.js/dist/essentia.js-core.es.js"),
      ]);
      // o build web baixa o binario por URL; copiado para public/ no pre-build
      const factory = wasm.default ?? wasm.EssentiaWASM;
      const runtime = await factory({ locateFile: () => "/essentia/essentia-wasm.web.wasm" });
      return new core.default(runtime);
    })().catch((error) => {
      instance = null;
      throw error;
    });
  }

  return instance;
}

// Janela central de ate 30s: o RhythmExtractor2013 e O(n) e caro, e os
// descritores sao estaveis nesse recorte.
function centerWindow(samples: Float32Array) {
  const size = 30 * FEATURE_SAMPLE_RATE;
  if (samples.length <= size) return samples;
  const start = Math.floor((samples.length - size) / 2);
  return samples.slice(start, start + size);
}

// Frame-level descriptors precisam de Spectrum. Iteramos com janela Hann +
// zero-padding, igual ao default profile da essentia.js (Windowing 1024 +
// Spectrum 2048). sampleRate passado aos metodos Essentia e o
// FEATURE_SAMPLE_RATE real dos samples (22050), NAO 44100 default.
const FRAME_SIZE = 1024;
const FFT_SIZE = 2048;

// Itera frames de tamanho FRAME_SIZE com hop = FRAME_SIZE/2 e acumula uma
// funcao `fn(spectrum, frame)` por frame. Retorna a media; se nenhum frame for
// produzido (sinal muito curto) ou qualquer frame lancar, retorna 0.
// Os tipos exportados por essentia.js-core sao incompletos (muitos algoritmos
// nao estao declarados). Usamos `any` aqui para que o TypeScript nao reclame
// de Windowing/Spectrum/HFC/PitchSalience/Flatness. O runtime funciona
// porque esses algoritmos existem no WASM.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function meanOverFrames(
  samples: Float32Array,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  essentia: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (spectrum: any, frame: number) => number,
): number {
  let sum = 0;
  let count = 0;
  for (let start = 0; start + FRAME_SIZE <= samples.length; start += FRAME_SIZE / 2) {
    const raw = samples.subarray(start, start + FRAME_SIZE);
    const frameVec = essentia.arrayToVector(raw);
    // Windowing(frame, normalized=true, size=FRAME_SIZE, type='hann',
    //            zeroPadding=FFT_SIZE-FRAME_SIZE, zeroPhase=true)
    const windowed = essentia.Windowing(frameVec, true, FRAME_SIZE, "hann", FFT_SIZE - FRAME_SIZE, true);
    const spectrum = essentia.Spectrum(windowed, FFT_SIZE);
    sum += fn(spectrum, count);
    count += 1;
    frameVec.delete?.();
    windowed.delete?.();
    spectrum.delete?.();
  }
  return count > 0 ? sum / count : 0;
}

// Wrappers resilientes: cada metodo essentia.js vive em try/catch proprio. Se
// o metodo nao existir nesta versao do WASM (e.g. algumas builds strippam
// PitchSalience), o sistema continua retornando 0 em vez de quebrar os outros
// descritores. Log em console.warn para diagnostico.

/**
 * Zero-Crossing Rate (ZCR) — fração de amostras que cruzam zero entre frames
 * consecutivos. Voz humana e percussão têm ZCR alto; tons puros têm ZCR baixo.
 * Ref: essentia.js ZeroCrossingRate — proxy de Scheirer & Slaney 1997.
 * @param essentia Instância carregada do Essentia.js.
 * @param vector   Buffer do sinal (VectorFloat).
 * @returns ZCR em [0, 1], ou 0 em falha.
 */
function safeZeroCrossingRate(// Tipos do essentia.js-core sao incompletos (algoritmos como HFC, PitchSalience,
// Flatness nao estao declarados). Usamos `any` para nao travar o build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
essentia: any, vector: ReturnType<Essentia["arrayToVector"]>): number {
  try {
    return essentia.ZeroCrossingRate(vector).zeroCrossingRate ?? 0;
  } catch (err) {
    console.warn("[essentia] ZeroCrossingRate failed:", err);
    return 0;
  }
}

/**
 * High-Frequency Content (HFC) — média sobre frames do coeficiente HFC de
 * Masri 1996. Discrimina instrumentos acústicos (HFC baixo) de sintéticos
 * (HFC alto).
 * Ref: Masri (1996) "Computer modelling of sound for transformation and
 *      synthesis of musical signals".
 * @param essentia Instância carregada do Essentia.js.
 * @param samples  Buffer PCM mono (Float32Array).
 * @returns HFC médio (raw, sem normalização), ou 0 em falha.
 */
function safeHfc(// Tipos do essentia.js-core sao incompletos (algoritmos como HFC, PitchSalience,
// Flatness nao estao declarados). Usamos `any` para nao travar o build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
essentia: any, samples: Float32Array): number {
  try {
    return meanOverFrames(samples, essentia, (spectrum) => {
      // HFC(spectrum, sampleRate=44100, type='Masri') — passamos a sr real.
      const r = essentia.HFC(spectrum, FEATURE_SAMPLE_RATE, "Masri");
      return r.hfc ?? 0;
    });
  } catch (err) {
    console.warn("[essentia] HFC failed:", err);
    return 0;
  }
}

/**
 * Pitch Salience — média sobre frames da saliência de pitch no espectro.
 * Mede "tem pitch estável" (não exatamente "tem voz"). Combinado com
 * spectral centroid, separa vocal de percussão tonal.
 * Ref: Muller & Lerch (2011) "Toward the detection of vocals in MIR".
 * @param essentia Instância carregada do Essentia.js.
 * @param samples  Buffer PCM mono (Float32Array).
 * @returns Salience média em [0, 1], ou 0 em falha.
 */
function safePitchSalienceMean(// Tipos do essentia.js-core sao incompletos (algoritmos como HFC, PitchSalience,
// Flatness nao estao declarados). Usamos `any` para nao travar o build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
essentia: any, samples: Float32Array): number {
  try {
    return meanOverFrames(samples, essentia, (spectrum) => {
      // PitchSalience(spectrum, highBoundary=5000, lowBoundary=100, sampleRate=44100)
      // retorna um number escalar (NAO objeto).
      const r = essentia.PitchSalience(spectrum, 5000, 100, FEATURE_SAMPLE_RATE);
      return typeof r === "number" ? r : 0;
    });
  } catch (err) {
    console.warn("[essentia] PitchSalience failed:", err);
    return 0;
  }
}

/**
 * Spectral Centroid (Hz) — centro de massa do espectro no domínio do tempo
 * (essentia.js expõe apenas SpectralCentroidTime). Indica "brilho" do sinal:
 * alto = agudo, baixo = grave.
 * Ref: doc essentia.js SpectralCentroidTime.
 * @param essentia Instância carregada do Essentia.js.
 * @param vector   Buffer do sinal (VectorFloat).
 * @returns Centróide em Hz, ou 0 em falha.
 */
function safeSpectralCentroidHz(// Tipos do essentia.js-core sao incompletos (algoritmos como HFC, PitchSalience,
// Flatness nao estao declarados). Usamos `any` para nao travar o build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
essentia: any, vector: ReturnType<Essentia["arrayToVector"]>): number {
  try {
    // essentia.js so expoe SpectralCentroidTime (calcula centroid em Hz via
    // first-difference no dominio do tempo). sampleRate default 44100; usamos
    // a sr real dos samples.
    const r = essentia.SpectralCentroidTime(vector, FEATURE_SAMPLE_RATE);
    return typeof r.centroid === "number" ? r.centroid : 0;
  } catch (err) {
    console.warn("[essentia] SpectralCentroidTime failed:", err);
    return 0;
  }
}

/**
 * Spectral Flatness — média sobre frames da razão geometric_mean/arith_mean
 * do espectro. Próximo de 1 = ruído branco; próximo de 0 = tom puro.
 * Ref: doc essentia.js Flatness.
 * @param essentia Instância carregada do Essentia.js.
 * @param samples  Buffer PCM mono (Float32Array).
 * @returns Flatness média em [0, 1], ou 0 em falha.
 */
function safeSpectralFlatnessMean(// Tipos do essentia.js-core sao incompletos (algoritmos como HFC, PitchSalience,
// Flatness nao estao declarados). Usamos `any` para nao travar o build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
essentia: any, samples: Float32Array): number {
  try {
    // essentia.js expoe Flatness(array) — geometric_mean / arith_mean ratio.
    // Aplicamos sobre o spectrum de cada frame para obter flatness espectral.
    return meanOverFrames(samples, essentia, (spectrum) => {
      const r = essentia.Flatness(spectrum);
      return r.flatness ?? 0;
    });
  } catch (err) {
    console.warn("[essentia] Flatness failed:", err);
    return 0;
  }
}

/**
 * Energy — soma de quadrados das amostras (sum of squares). Em sinais
 * normalizados [-1, 1] com 30s @ 22050Hz é da ordem de 1e5; manter raw
 * (callers podem normalizar).
 * Ref: doc essentia.js Energy.
 * @param essentia Instância carregada do Essentia.js.
 * @param vector   Buffer do sinal (VectorFloat).
 * @returns Energy raw (sum of squares), ou 0 em falha.
 */
function safeEnergy(// Tipos do essentia.js-core sao incompletos (algoritmos como HFC, PitchSalience,
// Flatness nao estao declarados). Usamos `any` para nao travar o build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
essentia: any, vector: ReturnType<Essentia["arrayToVector"]>): number {
  try {
    // Energy(array) retorna {energy} (sum of squares). Em samples normalizados
    // [-1, 1] com 30s @ 22050Hz isso e da ordem de 1e5 — manter raw, callers
    // podem normalizar se quiserem.
    const r = essentia.Energy(vector);
    return typeof r === "number" ? r : r.energy ?? 0;
  } catch (err) {
    console.warn("[essentia] Energy failed:", err);
    return 0;
  }
}

// Lanca em caso de falha fatal (loadEssentia ou os 4 descritores canonicos):
// quem chama decide se tenta de novo noutro contexto e o que mostrar na tela.
// Engolir o erro aqui foi o que escondeu a falha no worker. Os 6 descritores
// novos sao best-effort: um falha, todos os outros continuam.
export async function describeWithEssentia(samples: Float32Array): Promise<EssentiaDescriptors> {
  const essentia = await loadEssentia();
  const window = centerWindow(samples);
  const vector = essentia.arrayToVector(window);

  try {
    const rhythm = essentia.RhythmExtractor2013(vector);
    const key = essentia.KeyExtractor(vector);
    const dynamics = essentia.DynamicComplexity(vector);
    const dance = essentia.Danceability(vector);

    return {
      // a Danceability da Essentia vive em ~0..3; normalizamos para 0..1
      danceability: Math.max(0, Math.min(1, dance.danceability / 3)),
      bpm: rhythm.bpm,
      bpmConfidence: rhythm.confidence,
      key: key.key,
      scale: key.scale,
      keyStrength: key.strength,
      dynamicComplexity: dynamics.dynamicComplexity,
      loudnessDb: dynamics.loudness,
      // Wave 2: frame-level descriptors (todos com fallback 0).
      zcr: safeZeroCrossingRate(essentia, vector),
      hfc: safeHfc(essentia, window),
      pitchSalienceMean: safePitchSalienceMean(essentia, window),
      spectralCentroidHz: safeSpectralCentroidHz(essentia, vector),
      spectralFlatnessMean: safeSpectralFlatnessMean(essentia, window),
      energy: safeEnergy(essentia, vector),
    };
  } finally {
    vector.delete?.();
  }
}