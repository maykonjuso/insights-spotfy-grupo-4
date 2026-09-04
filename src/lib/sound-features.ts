import type { AudioSummary } from "./audio-features";
import type { EssentiaDescriptors } from "./essentia-analysis";

export type FeatureOrigin = "essentia" | "dsp" | "estimativa";

export type SoundFeature = {
  id: string;
  label: string;
  display: string;
  bar: number | null;
  origin: FeatureOrigin;
  hint: string;
};

export type SoundFeatureGroup = {
  title: string;
  note?: string;
  features: SoundFeature[];
};

export type SoundFeatureInput = {
  summary: AudioSummary | null;
  descriptors: EssentiaDescriptors | null;
  durationMs: number;
  clippedSamples?: number;
  /** "Duração" por padrão; a prévia de 30s usa "Trecho analisado" para não
   * competir com a duração real da faixa mostrada logo acima. */
  rotuloDuracao?: string;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function percent(value: number) {
  return `${Math.round(clamp(value) * 100)}%`;
}

function hz(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} kHz` : `${Math.round(value)} Hz`;
}

function duration(ms: number) {
  const minutes = Math.floor(ms / 60000);
  return `${minutes}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;
}

const MODE_LABEL: Record<string, string> = { major: "maior", minor: "menor" };

// As heuristicas abaixo aproximam features proprietarias do Spotify que nao
// temos como medir diretamente. Sao monotonas nos sinais que a literatura
// associa a cada conceito, mas continuam sendo estimativas -- por isso a
// interface marca cada uma como tal.
export function estimateAcousticness(summary: AudioSummary, descriptors: EssentiaDescriptors | null) {
  const brilho = clamp(summary.centroid / 4000);
  const ruido = clamp(summary.flatness / 0.5);
  const dinamica = clamp((descriptors?.dynamicComplexity ?? 3) / 8);
  return clamp(0.55 + 0.35 * dinamica - 0.45 * brilho - 0.3 * ruido);
}

export function estimateValence(summary: AudioSummary, descriptors: EssentiaDescriptors | null) {
  const modo = descriptors?.scale === "major" ? 0.15 : descriptors?.scale === "minor" ? -0.15 : 0;
  const andamento = clamp(((descriptors?.bpm ?? summary.tempo) - 60) / 120);
  const brilho = clamp(summary.centroid / 4000);
  const danca = descriptors?.danceability ?? 0.5;
  return clamp(0.5 + modo + 0.2 * (andamento - 0.5) + 0.15 * (brilho - 0.5) + 0.15 * (danca - 0.5));
}

export function estimateSpeechiness(summary: AudioSummary) {
  const cruzamentos = clamp(summary.zcr / 0.25);
  const ruido = clamp(summary.flatness / 0.4);
  const banda = clamp(summary.bandwidth / 3500);
  return clamp(0.35 * cruzamentos + 0.45 * ruido + 0.2 * banda - 0.12);
}

// instrumentalness e liveness sao as duas features do modelo sem nenhum
// analogo direto no que conseguimos medir: entram como heuristicas grosseiras
// e a interface as marca como o elo mais fraco da leitura.
export function estimateInstrumentalness(summary: AudioSummary, descriptors: EssentiaDescriptors | null) {
  const fala = estimateSpeechiness(summary);
  const tonalidade = descriptors?.keyStrength ?? 0.5;
  const brilho = clamp(summary.centroid / 4000);
  return clamp(0.6 - 1.4 * fala + 0.35 * (tonalidade - 0.5) - 0.25 * brilho);
}

export function estimateLiveness(summary: AudioSummary, descriptors: EssentiaDescriptors | null) {
  const dinamica = clamp((descriptors?.dynamicComplexity ?? 3) / 8);
  const ruido = clamp(summary.flatness / 0.5);
  return clamp(0.08 + 0.45 * dinamica + 0.3 * ruido);
}

export function buildSoundFeatures({
  summary,
  descriptors,
  durationMs,
  clippedSamples,
  rotuloDuracao,
}: SoundFeatureInput): SoundFeatureGroup[] {
  const groups: SoundFeatureGroup[] = [];

  if (descriptors) {
    groups.push({
      title: "Ritmo e tom",
      features: [
        {
          id: "tempo",
          label: "Andamento",
          display: `${Math.round(descriptors.bpm)} bpm`,
          bar: clamp((descriptors.bpm - 40) / 180),
          origin: "essentia",
          hint: "Batidas por minuto da música.",
        },
        {
          id: "bpmConfidence",
          label: "Certeza do andamento",
          display: `${descriptors.bpmConfidence.toFixed(1)} / 5.3`,
          bar: clamp(descriptors.bpmConfidence / 5.3),
          origin: "essentia",
          hint: "O quanto a batida ficou clara na medição. Valores baixos pedem desconfiança no andamento.",
        },
        {
          id: "key",
          label: "Tom",
          display: `${descriptors.key} ${MODE_LABEL[descriptors.scale] || descriptors.scale}`,
          bar: null,
          origin: "essentia",
          hint: "A tonalidade da música e se ela é maior ou menor.",
        },
        {
          id: "keyStrength",
          label: "Clareza do tom",
          display: percent(descriptors.keyStrength),
          bar: clamp(descriptors.keyStrength),
          origin: "essentia",
          hint: "O quanto a música se firma nesse tom.",
        },
        {
          id: "danceability",
          label: "Dançabilidade",
          display: percent(descriptors.danceability),
          bar: clamp(descriptors.danceability),
          origin: "essentia",
          hint: "O quanto a música convida a dançar.",
        },
        {
          id: "loudness",
          label: "Loudness",
          display: `${Math.round(descriptors.loudnessDb)} dB`,
          bar: clamp((descriptors.loudnessDb + 60) / 60),
          origin: "essentia",
          hint: "O volume médio da música.",
        },
        {
          id: "dynamicComplexity",
          label: "Variação de volume",
          display: `${descriptors.dynamicComplexity.toFixed(1)} dB`,
          bar: clamp(descriptors.dynamicComplexity / 10),
          origin: "essentia",
          hint: "A diferença entre as partes mais altas e mais baixas. Valores baixos indicam mixagem muito comprimida.",
        },
      ],
    });
  }

  if (summary) {
    groups.push({
      title: "Textura do som",
      features: [
        {
          id: "energy",
          label: "Energia",
          display: percent(summary.rms / 0.28),
          bar: clamp(summary.rms / 0.28),
          origin: "dsp",
          hint: "O quanto a música soa cheia e intensa.",
        },
        {
          id: "centroid",
          label: "Brilho",
          display: hz(summary.centroid),
          bar: clamp(summary.centroid / 5000),
          origin: "dsp",
          hint: "Quanto maior, mais brilhante o som.",
        },
        {
          id: "rolloff",
          label: "Agudos",
          display: hz(summary.rolloff),
          bar: clamp(summary.rolloff / 9000),
          origin: "dsp",
          hint: "Até onde a música vai nos agudos.",
        },
        {
          id: "bandwidth",
          label: "Variedade de frequências",
          display: hz(summary.bandwidth),
          bar: clamp(summary.bandwidth / 4000),
          origin: "dsp",
          hint: "O quanto o som ocupa graves, médios e agudos ao mesmo tempo.",
        },
        {
          id: "zcr",
          label: "Aspereza",
          display: percent(summary.zcr / 0.3),
          bar: clamp(summary.zcr / 0.3),
          origin: "dsp",
          hint: "Sobe com percussão, distorção e voz.",
        },
        {
          id: "flatness",
          label: "Chiado",
          display: percent(summary.flatness / 0.5),
          bar: clamp(summary.flatness / 0.5),
          origin: "dsp",
          hint: "Perto de zero o som é limpo. Perto de cem já é quase chiado.",
        },
        {
          id: "contrast",
          label: "Contraste",
          display: summary.contrastMean.toFixed(2),
          bar: clamp(summary.contrastMean / 6),
          origin: "dsp",
          hint: "A diferença entre as partes cheias e as partes vazias do som.",
        },
        {
          id: "peak",
          label: "Pico de volume",
          display: percent(summary.peak),
          bar: clamp(summary.peak),
          origin: "dsp",
          hint: "Perto de cem por cento o áudio corre risco de estourar.",
        },
      ],
    });
  }

  if (summary) {
    groups.push({
      title: "Estimativas",
      note: "Estes valores não dá para medir direto no áudio, então são um chute com base nas medidas acima. Servem para comparar músicas entre si, não como número exato.",
      features: [
        {
          id: "acousticness",
          label: "Som acústico",
          display: percent(estimateAcousticness(summary, descriptors)),
          bar: estimateAcousticness(summary, descriptors),
          origin: "estimativa",
          hint: "Sobe quando o som lembra instrumentos acústicos em vez de produção eletrônica.",
        },
        {
          id: "valence",
          label: "Clima alegre",
          display: percent(estimateValence(summary, descriptors)),
          bar: estimateValence(summary, descriptors),
          origin: "estimativa",
          hint: "Junta tom maior ou menor, andamento e brilho para adivinhar o clima.",
        },
        {
          id: "speechiness",
          label: "Presença de voz falada",
          display: percent(estimateSpeechiness(summary)),
          bar: estimateSpeechiness(summary),
          origin: "estimativa",
          hint: "Tenta separar canto de fala. Sobe em rap e em faixas muito faladas.",
        },
        {
          id: "instrumentalness",
          label: "Só instrumentos",
          display: percent(estimateInstrumentalness(summary, descriptors)),
          bar: estimateInstrumentalness(summary, descriptors),
          origin: "estimativa",
          hint: "Chute de o quanto a faixa é instrumental. É uma das medidas mais frágeis daqui.",
        },
        {
          id: "liveness",
          label: "Cara de show ao vivo",
          display: percent(estimateLiveness(summary, descriptors)),
          bar: estimateLiveness(summary, descriptors),
          origin: "estimativa",
          hint: "Chute de gravação ao vivo, pelo ruído de ambiente. É uma das medidas mais frágeis daqui.",
        },
      ],
    });
  }

  const basicos: SoundFeature[] = [
    {
      id: "duration",
      label: rotuloDuracao || "Duração",
      display: duration(durationMs),
      bar: null,
      origin: "dsp",
      hint: "Quanto tempo de áudio entrou na conta.",
    },
  ];

  if (typeof clippedSamples === "number") {
    basicos.push({
      id: "clipping",
      label: "Trechos estourados",
      display: String(clippedSamples),
      bar: null,
      origin: "dsp",
      hint: "Pedaços em que o áudio passou do limite. Qualquer número alto pede revisão da mixagem.",
    });
  }

  groups.push({ title: "Sobre o áudio", features: basicos });

  return groups;
}
