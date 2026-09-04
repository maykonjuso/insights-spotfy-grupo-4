// Ponte entre as duas metades do projeto: o que o navegador mede do audio
// (Essentia em WASM + DSP proprio) e as 11 features que o modelo bayesiano
// k=11 espera receber. Cada campo declara de onde veio, porque metade e
// medida e metade e estimativa -- e a interface precisa dizer isso ao usuario.
import type { AudioSummary } from "./audio-features";
import type { EssentiaDescriptors } from "./essentia-analysis";
import type { TrackFeatures } from "./model/types";
import {
  estimateAcousticness,
  estimateInstrumentalness,
  estimateLiveness,
  estimateSpeechiness,
  estimateValence,
} from "./sound-features";

export type FeatureOrigin = "essentia" | "dsp" | "estimativa" | "usuario";

export type ModelFeatureKey = keyof TrackFeatures;

export type FeatureMeta = {
  key: ModelFeatureKey;
  label: string;
  origin: FeatureOrigin;
  min: number;
  max: number;
  step: number;
  unit: "percent" | "db" | "bpm" | "bool";
};

// ordem identica a artifacts/feature_names.json
export const FEATURE_META: FeatureMeta[] = [
  { key: "danceability", label: "Dançabilidade", origin: "essentia", min: 0, max: 1, step: 0.01, unit: "percent" },
  { key: "energy", label: "Energia", origin: "dsp", min: 0, max: 1, step: 0.01, unit: "percent" },
  { key: "loudness", label: "Volume", origin: "essentia", min: -60, max: 0, step: 0.5, unit: "db" },
  { key: "speechiness", label: "Fala", origin: "estimativa", min: 0, max: 1, step: 0.01, unit: "percent" },
  { key: "acousticness", label: "Acústica", origin: "estimativa", min: 0, max: 1, step: 0.01, unit: "percent" },
  { key: "instrumentalness", label: "Instrumental", origin: "estimativa", min: 0, max: 1, step: 0.01, unit: "percent" },
  { key: "liveness", label: "Ao vivo", origin: "estimativa", min: 0, max: 1, step: 0.01, unit: "percent" },
  { key: "valence", label: "Positividade", origin: "estimativa", min: 0, max: 1, step: 0.01, unit: "percent" },
  { key: "tempo", label: "Andamento", origin: "essentia", min: 40, max: 220, step: 1, unit: "bpm" },
  { key: "explicit", label: "Explícito", origin: "usuario", min: 0, max: 1, step: 1, unit: "bool" },
  { key: "mode_bin", label: "Tom maior", origin: "essentia", min: 0, max: 1, step: 1, unit: "bool" },
];

// Math.max(0, Math.min(1, NaN)) devolve NaN, entao um clamp comum deixa passar
// medida invalida. A Essentia pode devolver NaN em bpm num trecho curto ou quase
// mudo, e o modelo recusa o vetor inteiro com 400: uma unica medida ruim
// derrubava a leitura toda. `padrao` e o valor usado quando nao ha medida.
function clamp(value: number, min: number, max: number, padrao = min) {
  if (!Number.isFinite(value)) return padrao;
  return Math.max(min, Math.min(max, value));
}

export function formatFeature(meta: FeatureMeta, value: number) {
  if (meta.unit === "percent") return `${Math.round(value * 100)}%`;
  if (meta.unit === "db") return `${Math.round(value)} dB`;
  if (meta.unit === "bpm") return `${Math.round(value)} bpm`;
  return value === 1 ? "sim" : "não";
}

export type BridgeInput = {
  summary: AudioSummary | null;
  descriptors: EssentiaDescriptors | null;
  explicit?: 0 | 1;
};

// Sem `summary` nao ha leitura nenhuma do audio; o chamador decide o que
// mostrar em vez de receber um vetor inventado.
export function toModelFeatures({ summary, descriptors, explicit = 0 }: BridgeInput): TrackFeatures | null {
  if (!summary) return null;

  const rmsDb = 20 * Math.log10(Math.max(Number.isFinite(summary.rms) ? summary.rms : 0, 1e-6));
  const energia = clamp(summary.rms / 0.28, 0, 1, 0.5);
  const andamento = clamp(descriptors?.bpm ?? summary.tempo, 40, 220, 110);

  // Sem a Essentia nao ha medida de dancabilidade; o substituto combina energia
  // com a distancia ate a faixa de andamento onde a maioria das faixas dancantes
  // vive (~118 bpm). Copiar a energia crua deixaria as duas barras identicas na
  // tela, o que pareceria defeito.
  const dancaEstimada = clamp(
    0.3 + 0.4 * energia + 0.3 * (1 - Math.min(1, Math.abs(andamento - 118) / 70)),
    0,
    1,
    0.5,
  );

  return {
    danceability: clamp(descriptors?.danceability ?? dancaEstimada, 0, 1, 0.5),
    energy: energia,
    loudness: clamp(descriptors?.loudnessDb ?? rmsDb, -60, 0, -12),
    speechiness: clamp(estimateSpeechiness(summary), 0, 1, 0.1),
    acousticness: clamp(estimateAcousticness(summary, descriptors), 0, 1, 0.4),
    instrumentalness: clamp(estimateInstrumentalness(summary, descriptors), 0, 1, 0.2),
    liveness: clamp(estimateLiveness(summary, descriptors), 0, 1, 0.2),
    valence: clamp(estimateValence(summary, descriptors), 0, 1, 0.5),
    tempo: andamento,
    explicit,
    mode_bin: descriptors?.scale === "minor" ? 0 : 1,
  };
}

// O classificador de genero foi treinado no GTZAN (10 classes norte-americanas);
// o modelo k=11 conhece 107 generos do catalogo do Spotify. Os dez nomes abaixo
// existem nos dois lados, entao o mapa e direto -- o que o GTZAN nao cobre
// (sertanejo, mpb, funk, k-pop...) fica para a troca manual de genero na tela.
export const GTZAN_TO_MODEL: Record<string, string> = {
  blues: "blues",
  classical: "classical",
  country: "country",
  disco: "disco",
  hiphop: "hip-hop",
  jazz: "jazz",
  metal: "metal",
  pop: "pop",
  reggae: "reggae",
  rock: "rock",
};

// Sugestoes de comparacao: generos populares do catalogo que o GTZAN nao
// alcanca, usados na corrida de generos para dar contraste a leitura.
export const GENEROS_DESTAQUE = [
  "pop",
  "k-pop",
  "hip-hop",
  "rock",
  "sertanejo",
  "mpb",
  "funk",
  "pagode",
  "edm",
  "metal",
  "chill",
  "sad",
];

export function modelGenreFor(gtzanGenre: string | undefined) {
  return (gtzanGenre && GTZAN_TO_MODEL[gtzanGenre]) || "pop";
}
