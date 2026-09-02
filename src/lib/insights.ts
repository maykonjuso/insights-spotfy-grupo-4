import type { AudioFeatures, SpotifyTrack } from "./spotify";

export type TrackInsight = {
  score: number;
  label: string;
  tone: "low" | "mid" | "high";
  signals: string[];
  audioFeaturesAvailable: boolean;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function percent(value?: number) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : null;
}

export function buildTrackInsight(track: SpotifyTrack, features: AudioFeatures | null): TrackInsight {
  const officialPopularity = typeof track.popularity === "number" ? track.popularity : null;
  let score = officialPopularity ?? 42;
  const signals: string[] = [];

  if (officialPopularity !== null) {
    if (officialPopularity >= 75) {
      signals.push("Tração muito forte no catálogo atual do Spotify.");
    } else if (officialPopularity >= 55) {
      signals.push("Boa tração: faixa já compete acima da média de catálogo.");
    } else if (officialPopularity >= 35) {
      signals.push("Potencial intermediário: precisa de contexto, nicho ou distribuição.");
    } else {
      signals.push("Baixa tração no snapshot atual de popularidade.");
    }
  } else {
    signals.push("Popularity oficial não veio nesta resposta da API; score estimado por metadados.");
  }

  const releaseTime = Date.parse(track.album.release_date);
  if (!Number.isNaN(releaseTime)) {
    const monthsSinceRelease = (Date.now() - releaseTime) / (1000 * 60 * 60 * 24 * 30.44);
    if (monthsSinceRelease <= 18) {
      score += 8;
      signals.push("Lançamento recente aumenta o sinal de descoberta e teste de mercado.");
    }
  }

  if (track.explicit) {
    score += 3;
    signals.push("Conteúdo explícito pode se alinhar a hip-hop/pop contemporâneo.");
  }

  const artistCount = track.artists.length;
  if (artistCount > 1) {
    score += Math.min(6, artistCount * 1.5);
    signals.push(`${artistCount} artistas creditados ampliam descoberta cruzada.`);
  }

  if (features) {
    const dance = percent(features.danceability);
    const energy = percent(features.energy);
    const valence = percent(features.valence);

    if ((features.danceability ?? 0) >= 0.68) {
      score += 4;
      signals.push(`Dançabilidade alta (${dance}) favorece retenção em playlists.`);
    }
    if ((features.energy ?? 0) >= 0.45 && (features.energy ?? 0) <= 0.75) {
      score += 3;
      signals.push(`Energia média/alta (${energy}) fica próxima do pico observado no relatório.`);
    }
    if ((features.instrumentalness ?? 0) > 0.5) {
      score -= 5;
      signals.push("Perfil muito instrumental tende a performar pior no recorte analisado.");
    }
    if ((features.acousticness ?? 0) > 0.7) {
      score -= 2;
      signals.push("Acousticness alta pede leitura de nicho antes de apostar em massa.");
    }
    if (valence) {
      signals.push(`Valência estimada: ${valence}; no relatório, esse efeito foi pequeno.`);
    }
  } else {
    signals.push("Audio features não disponíveis para esta credencial/API; análise usa dados públicos da faixa.");
  }

  score = Math.round(clamp(score));
  const tone = score >= 70 ? "high" : score >= 45 ? "mid" : "low";
  const label = tone === "high" ? "Alta chance" : tone === "mid" ? "Potencial médio" : "Baixa chance";

  return {
    score,
    label,
    tone,
    signals: signals.slice(0, 5),
    audioFeaturesAvailable: Boolean(features),
  };
}

export function durationLabel(durationMs: number) {
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.round((durationMs % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}
