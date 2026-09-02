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
  error?: string;
};

// A analise pesada (Essentia em WASM + classificador) sai da thread principal
// para a interface nao congelar durante os segundos de processamento.
self.addEventListener("message", async (event: MessageEvent<AnalysisRequest>) => {
  const { id, samples } = event.data;

  try {
    const classification = classifyAudio(samples);
    const descriptors = await describeWithEssentia(samples);
    const response: AnalysisResponse = { id, classification, descriptors };
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
