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
