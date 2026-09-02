"use client";

import type { AnalysisRequest, AnalysisResponse } from "@/workers/audio-analysis.worker";
import { classifyAudio, type Classification } from "./genre-classifier";
import { describeWithEssentia, type EssentiaDescriptors } from "./essentia-analysis";

export type AudioAnalysis = {
  classification: Classification | null;
  descriptors: EssentiaDescriptors | null;
  onMainThread: boolean;
};

type Pending = {
  resolve: (value: AnalysisResponse) => void;
  reject: (reason: Error) => void;
};

let worker: Worker | null = null;
let workerBroken = false;
let sequence = 0;
const pending = new Map<number, Pending>();

function failAll(reason: Error) {
  pending.forEach((entry) => entry.reject(reason));
  pending.clear();
}

function getWorker() {
  if (workerBroken) return null;
  if (worker) return worker;

  try {
    worker = new Worker(new URL("../workers/audio-analysis.worker.ts", import.meta.url));
    worker.addEventListener("message", (event: MessageEvent<AnalysisResponse>) => {
      const entry = pending.get(event.data.id);
      if (!entry) return;
      pending.delete(event.data.id);
      entry.resolve(event.data);
    });
    worker.addEventListener("error", () => {
      workerBroken = true;
      worker?.terminate();
      worker = null;
      failAll(new Error("worker indisponível"));
    });
  } catch {
    workerBroken = true;
    worker = null;
  }

  return worker;
}

async function runOnMainThread(samples: Float32Array): Promise<AudioAnalysis> {
  return {
    classification: classifyAudio(samples),
    descriptors: await describeWithEssentia(samples),
    onMainThread: true,
  };
}

export async function analyzeSamples(samples: Float32Array): Promise<AudioAnalysis> {
  const instance = getWorker();
  if (!instance) return runOnMainThread(samples);

  // copia dedicada para transferir: o Float32Array original aponta para a
  // memoria interna do AudioBuffer, que nao pode ser destacada
  const copy = samples.slice();
  const id = (sequence += 1);

  try {
    const response = await new Promise<AnalysisResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      const request: AnalysisRequest = { id, samples: copy };
      instance.postMessage(request, [copy.buffer]);
    });

    if (response.error) throw new Error(response.error);

    return {
      classification: response.classification,
      descriptors: response.descriptors,
      onMainThread: false,
    };
  } catch {
    pending.delete(id);
    return runOnMainThread(samples);
  }
}
