import { GENRE_MODEL as model } from "./genre-model";
import { FEATURE_NAMES, extractFeatures, pickWindows, type AudioSummary } from "./audio-features";

export type GenreScore = {
  genre: string;
  label: string;
  probability: number;
};

export type Classification = {
  scores: GenreScore[];
  summary: AudioSummary;
  windows: number;
  modelAccuracy: number;
};

const LABELS: Record<string, string> = {
  blues: "Blues",
  classical: "Clássico",
  country: "Country",
  disco: "Disco",
  hiphop: "Hip-hop",
  jazz: "Jazz",
  metal: "Metal",
  pop: "Pop",
  reggae: "Reggae",
  rock: "Rock",
};

// O modelo e treinado sobre a saida deste mesmo extrator, mas a ordem das
// colunas vem do JSON: reindexar evita quebra silenciosa se o vetor mudar.
const featureOrder = model.features.map((name) => {
  const index = FEATURE_NAMES.indexOf(name);
  if (index < 0) throw new Error(`Feature ausente no extrator: ${name}`);
  return index;
});

export function genreLabel(genre: string) {
  return LABELS[genre] || genre;
}

export function modelInfo() {
  return {
    source: model.fonte,
    generatedAt: model.geradoEm,
    accuracy: model.metricas.acuraciaCv,
    baseline: model.metricas.baseline,
    genres: model.classes.map(genreLabel),
  };
}

function probabilities(vector: number[]) {
  const logits = model.coeficientes.map((weights, classIndex) => {
    let total = model.intercepto[classIndex];
    for (let position = 0; position < featureOrder.length; position += 1) {
      const raw = vector[featureOrder[position]];
      const scaled = (raw - model.media[position]) / (model.escala[position] || 1);
      total += weights[position] * scaled;
    }
    return total;
  });

  const highest = Math.max(...logits);
  const exponentials = logits.map((logit) => Math.exp(logit - highest));
  const sum = exponentials.reduce((total, value) => total + value, 0);
  return exponentials.map((value) => value / sum);
}

export function classifyAudio(samples: Float32Array): Classification {
  const windows = pickWindows(samples);
  const averaged = new Array<number>(model.classes.length).fill(0);
  let summary: AudioSummary | null = null;

  for (const window of windows) {
    const { vector, summary: windowSummary } = extractFeatures(window);
    const distribution = probabilities(vector);
    for (let index = 0; index < averaged.length; index += 1) {
      averaged[index] += distribution[index] / windows.length;
    }
    if (!summary) summary = windowSummary;
  }

  const scores = model.classes
    .map((genre, index) => ({ genre, label: genreLabel(genre), probability: averaged[index] }))
    .sort((a, b) => b.probability - a.probability);

  return {
    scores,
    summary: summary || {
      tempo: 0,
      centroid: 0,
      rolloff: 0,
      bandwidth: 0,
      zcr: 0,
      rms: 0,
      peak: 0,
      contrastMean: 0,
      flatness: 0,
    },
    windows: windows.length,
    modelAccuracy: model.metricas.acuraciaCv,
  };
}
