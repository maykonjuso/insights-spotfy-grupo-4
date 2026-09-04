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
}: SoundFeatureInput): SoundFeatureGroup[] {
  const groups: SoundFeatureGroup[] = [];

  if (descriptors) {
    groups.push({
      title: "Medidas da Essentia",
      features: [
        {
          id: "tempo",
          label: "Andamento",
          display: `${Math.round(descriptors.bpm)} bpm`,
          bar: clamp((descriptors.bpm - 40) / 180),
          origin: "essentia",
          hint: "RhythmExtractor2013: batidas por minuto estimadas pelo método multifeature.",
        },
        {
          id: "bpmConfidence",
          label: "Confiança do andamento",
          display: `${descriptors.bpmConfidence.toFixed(1)} / 5.3`,
          bar: clamp(descriptors.bpmConfidence / 5.3),
          origin: "essentia",
          hint: "Concordância entre os estimadores de batida; abaixo de 1.5 o BPM é pouco confiável.",
        },
        {
          id: "key",
          label: "Tom",
          display: `${descriptors.key} ${MODE_LABEL[descriptors.scale] || descriptors.scale}`,
          bar: null,
          origin: "essentia",
          hint: "KeyExtractor: tonalidade e modo (equivalentes a key e mode do Spotify).",
        },
        {
          id: "keyStrength",
          label: "Força do tom",
          display: percent(descriptors.keyStrength),
          bar: clamp(descriptors.keyStrength),
          origin: "essentia",
          hint: "Quanto o perfil de croma da faixa adere ao tom detectado.",
        },
        {
          id: "danceability",
          label: "Dançabilidade",
          display: percent(descriptors.danceability),
          bar: clamp(descriptors.danceability),
          origin: "essentia",
          hint: "Danceability da Essentia (0–3 na escala original), normalizada para 0–100%.",
        },
        {
          id: "loudness",
          label: "Loudness",
          display: `${Math.round(descriptors.loudnessDb)} dB`,
          bar: clamp((descriptors.loudnessDb + 60) / 60),
          origin: "essentia",
          hint: "Loudness médio em dB, no mesmo espírito da feature loudness do Spotify.",
        },
        {
          id: "dynamicComplexity",
          label: "Complexidade dinâmica",
          display: `${descriptors.dynamicComplexity.toFixed(1)} dB`,
          bar: clamp(descriptors.dynamicComplexity / 10),
          origin: "essentia",
          hint: "Variação de loudness ao longo da faixa; valores baixos indicam master comprimido.",
        },
      ],
    });
  }

  if (summary) {
    groups.push({
      title: "Descritores espectrais",
      features: [
        {
          id: "energy",
          label: "Energia",
          display: percent(summary.rms / 0.28),
          bar: clamp(summary.rms / 0.28),
          origin: "dsp",
          hint: "RMS médio normalizado — análogo direto da feature energy.",
        },
        {
          id: "centroid",
          label: "Brilho (centroide)",
          display: hz(summary.centroid),
          bar: clamp(summary.centroid / 5000),
          origin: "dsp",
          hint: "Centro de massa do espectro: quanto maior, mais brilhante o timbre.",
        },
        {
          id: "rolloff",
          label: "Rolloff 85%",
          display: hz(summary.rolloff),
          bar: clamp(summary.rolloff / 9000),
          origin: "dsp",
          hint: "Frequência abaixo da qual está 85% da energia espectral.",
        },
        {
          id: "bandwidth",
          label: "Largura de banda",
          display: hz(summary.bandwidth),
          bar: clamp(summary.bandwidth / 4000),
          origin: "dsp",
          hint: "Dispersão do espectro em torno do centroide.",
        },
        {
          id: "zcr",
          label: "Cruzamentos por zero",
          display: percent(summary.zcr / 0.3),
          bar: clamp(summary.zcr / 0.3),
          origin: "dsp",
          hint: "Taxa de troca de sinal da forma de onda; sobe com percussão, distorção e voz.",
        },
        {
          id: "flatness",
          label: "Planicidade espectral",
          display: percent(summary.flatness / 0.5),
          bar: clamp(summary.flatness / 0.5),
          origin: "dsp",
          hint: "Perto de 0 o som é tonal; perto de 100% se aproxima de ruído.",
        },
        {
          id: "contrast",
          label: "Contraste espectral",
          display: summary.contrastMean.toFixed(2),
          bar: clamp(summary.contrastMean / 6),
          origin: "dsp",
          hint: "Diferença média entre picos e vales por banda de oitava.",
        },
        {
          id: "peak",
          label: "Pico",
          display: percent(summary.peak),
          bar: clamp(summary.peak),
          origin: "dsp",
          hint: "Amplitude máxima da forma de onda; perto de 100% indica risco de clipping.",
        },
      ],
    });
  }

  if (summary) {
    groups.push({
      title: "Estimativas",
      note: "O Spotify não publica mais estas features e elas não são medíveis diretamente; os valores abaixo são heurísticas sobre os descritores acima, úteis para comparar faixas entre si.",
      features: [
        {
          id: "acousticness",
          label: "Acústica",
          display: percent(estimateAcousticness(summary, descriptors)),
          bar: estimateAcousticness(summary, descriptors),
          origin: "estimativa",
          hint: "Sobe com dinâmica preservada e cai com brilho e ruído espectral.",
        },
        {
          id: "valence",
          label: "Valência",
          display: percent(estimateValence(summary, descriptors)),
          bar: estimateValence(summary, descriptors),
          origin: "estimativa",
          hint: "Combina modo maior/menor, andamento, brilho e dançabilidade.",
        },
        {
          id: "speechiness",
          label: "Fala",
          display: percent(estimateSpeechiness(summary)),
          bar: estimateSpeechiness(summary),
          origin: "estimativa",
          hint: "Combina cruzamentos por zero, planicidade espectral e largura de banda.",
        },
        {
          id: "instrumentalness",
          label: "Instrumental",
          display: percent(estimateInstrumentalness(summary, descriptors)),
          bar: estimateInstrumentalness(summary, descriptors),
          origin: "estimativa",
          hint: "Cai com presenca de fala e brilho, sobe com tonalidade estavel. Estimativa fraca.",
        },
        {
          id: "liveness",
          label: "Ao vivo",
          display: percent(estimateLiveness(summary, descriptors)),
          bar: estimateLiveness(summary, descriptors),
          origin: "estimativa",
          hint: "Sobe com dinamica aberta e ruido de sala. Estimativa fraca.",
        },
      ],
    });
  }

  const basicos: SoundFeature[] = [
    {
      id: "duration",
      label: "Duração",
      display: duration(durationMs),
      bar: null,
      origin: "dsp",
      hint: "Equivalente a duration_ms.",
    },
  ];

  if (typeof clippedSamples === "number") {
    basicos.push({
      id: "clipping",
      label: "Amostras em clipping",
      display: String(clippedSamples),
      bar: null,
      origin: "dsp",
      hint: "Amostras com amplitude ≥ 0,98; qualquer valor alto pede revisão do master.",
    });
  }

  groups.push({ title: "Faixa", features: basicos });

  return groups;
}
