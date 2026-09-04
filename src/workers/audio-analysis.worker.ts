import { classifyAudio, type Classification } from "@/lib/genre-classifier";
import { describeWithEssentia, type EssentiaDescriptors } from "@/lib/essentia-analysis";

export type AnalysisRequest = {
  id: number;
  samples: Float32Array;
};

export type AnalysisResponse = {
  id: number;
  classification: Classification | null;
  descriptors: EssentiaDescriptors | null;
  descriptorsError?: string;
  error?: string;
};

// A analise pesada (Essentia em WASM + classificador) sai da thread principal
// para a interface nao congelar durante os segundos de processamento.
//
// Setup verificado em Wave 3 (build-worker):
//   - este handler e ASYNC: `await describeWithEssentia(samples)` espera
//     loadEssentia() (WASM init ~2,5 MB) antes de tocar nos descritores.
//   - loadEssentia() faz `await import("essentia.js/dist/essentia-wasm.web.js")`
//     e `await factory({ locateFile: ... })` — sem isso o WASM nao carrega.
//   - ensureDocumentShim() injeta { currentScript: null } no globalThis
//     porque o build web le document.currentScript no init (nao existe em Worker).
//   - postMessage(response) e o canal de volta; o orquestrador em
//     src/lib/audio-analysis.ts faz o match por id no Map<number, Pending>.
//
// Tempo esperado: ~3-5s para 30s de audio (carga WASM one-shot ~1,5s +
// 4 descritores canonicos + 6 wrappers frame-level + classifyAudio).
// Acima de ~8s considera-se que algo travou (devtools > Performance).
self.addEventListener("message", async (event: MessageEvent<AnalysisRequest>) => {
  const { id, samples } = event.data;

  try {
    const classification = classifyAudio(samples);
    let descriptors: EssentiaDescriptors | null = null;
    let descriptorsError: string | undefined;

    // a Essentia pode falhar sozinha sem invalidar a classificacao
    try {
      descriptors = await describeWithEssentia(samples);
    } catch (essentiaError) {
      descriptorsError = essentiaError instanceof Error ? essentiaError.message : "falha ao carregar a Essentia";
    }

    const response: AnalysisResponse = { id, classification, descriptors, descriptorsError };
    self.postMessage(response);
  } catch (error) {
    const response: AnalysisResponse = {
      id,
      classification: null,
      descriptors: null,
      error: error instanceof Error ? error.message : "falha na análise",
    };
    self.postMessage(response);
  }
});
