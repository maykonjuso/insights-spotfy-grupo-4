// A essentia.js 0.1.3 nao publica tipos para os builds ES; declaramos apenas a
// superficie que o app usa.
declare module "essentia.js/dist/essentia-wasm.web.js" {
  type EssentiaWasmModule = Record<string, unknown>;
  type EssentiaWasmFactory = (options?: { locateFile?: (path: string) => string }) => Promise<EssentiaWasmModule>;
  const EssentiaWASM: EssentiaWasmFactory;
  export default EssentiaWASM;
  export { EssentiaWASM };
}

declare module "essentia.js/dist/essentia.js-core.es.js" {
  export type VectorFloat = { delete?: () => void };

  export default class Essentia {
    constructor(wasm: unknown, isDebug?: boolean);
    version: string;
    arrayToVector(array: Float32Array): VectorFloat;
    Danceability(signal: VectorFloat): { danceability: number };
    RhythmExtractor2013(signal: VectorFloat): { bpm: number; confidence: number };
    KeyExtractor(signal: VectorFloat): { key: string; scale: string; strength: number };
    DynamicComplexity(signal: VectorFloat): { dynamicComplexity: number; loudness: number };
    delete(): void;
    shutdown(): void;
  }
}
