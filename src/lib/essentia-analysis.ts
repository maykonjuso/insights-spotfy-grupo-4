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
};

// A Essentia e o mesmo motor usado em scripts/classificar_genero.py; aqui ela
// roda em WebAssembly, entao os descritores da tela batem com os do pipeline
// offline. O bundle tem ~2,5 MB, por isso o import e dinamico.
let instance: Promise<Essentia> | null = null;

async function loadEssentia() {
  if (!instance) {
    instance = (async () => {
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

export async function describeWithEssentia(samples: Float32Array): Promise<EssentiaDescriptors | null> {
  try {
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
      };
    } finally {
      vector.delete?.();
    }
  } catch {
    return null;
  }
}
