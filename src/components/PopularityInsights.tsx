"use client";

import { useEffect, type CSSProperties } from "react";
import { buildTrackInsight, durationLabel } from "@/lib/insights";
import { currentSourceId, stopPlayback } from "@/lib/preview-player";
import type { AudioFeatures, SpotifyTrack } from "@/lib/spotify";
import { PreviewPlayer } from "./PreviewPlayer";
import { TrackScanner } from "./TrackScanner";

export type PreviewInfo = {
  source: "spotify" | "itunes";
  label: string;
};

export type TrackDetails = {
  track: SpotifyTrack;
  features: AudioFeatures | null;
  preview?: PreviewInfo | null;
  insight: {
    score: number;
    label: string;
    tone: "low" | "mid" | "high";
    signals: string[];
  };
};

type PopularityInsightsProps = {
  details: TrackDetails | null;
  isLoading: boolean;
};

function artwork(track?: SpotifyTrack) {
  return track?.album.images[1]?.url || track?.album.images[0]?.url;
}

function metricLabel(value: number, suffix = "%") {
  if (suffix === "bpm") return `${Math.round(value)} bpm`;
  return `${Math.round(value * 100)}${suffix}`;
}

function releaseLabel(releaseDate: string) {
  const [year, month, day] = releaseDate.split("-");
  if (day) return `${day}/${month}/${year}`;
  if (month) return `${month}/${year}`;
  return year || releaseDate;
}

export function PopularityInsights({ details, isLoading }: PopularityInsightsProps) {
  const track = details?.track;
  const features = details?.features;
  const insight = details?.insight;
  const preview = details?.preview;
  const image = artwork(track);
  const popularity = typeof track?.popularity === "number" ? track.popularity : null;
  const score = insight?.score ?? (track ? buildTrackInsight(track, null).score : 0);
  const scoreStyle = { "--score": score } as CSSProperties;
  const trackId = track?.id;

  // so entra na grade o que a API realmente devolveu: com as credenciais atuais
  // popularity e audio-features vem vazios, e celulas com "--" so poluem a tela
  const metrics = track
    ? [
        ...(popularity !== null ? [{ label: "Popularidade", value: `${popularity}/100` }] : []),
        { label: "Duração", value: durationLabel(track.duration_ms) },
        { label: "Lançamento", value: releaseLabel(track.album.release_date) },
        { label: "Artistas", value: String(track.artists.length) },
        { label: "Explícito", value: track.explicit ? "Sim" : "Não" },
        ...(typeof features?.danceability === "number"
          ? [{ label: "Dançabilidade", value: metricLabel(features.danceability) }]
          : []),
        ...(typeof features?.energy === "number"
          ? [{ label: "Energia", value: metricLabel(features.energy) }]
          : []),
        ...(typeof features?.valence === "number"
          ? [{ label: "Valência", value: metricLabel(features.valence) }]
          : []),
        ...(typeof features?.tempo === "number"
          ? [{ label: "Tempo", value: metricLabel(features.tempo, "bpm") }]
          : []),
      ]
    : [];

  // trocar de faixa corta a previa anterior; continuar a mesma faixa nao.
  useEffect(() => {
    if (trackId && currentSourceId() && currentSourceId() !== trackId) stopPlayback();
  }, [trackId]);

  return (
    <aside className="insight-card" id="analise">
      {isLoading ? <div className="insight-loading">Analisando sinais da faixa...</div> : null}

      {!track && !isLoading ? (
        <p className="empty-state">Escolha uma música para ver a análise.</p>
      ) : null}

      {track ? (
        <>
          <div className="selected-track">
            {image ? <img src={image} alt={`Capa de ${track.album.name}`} /> : <span className="cover-fallback large" />}
            <div>
              <span className="album-label">{track.album.name}</span>
              <h3>{track.name}</h3>
              <p>{track.artists.map((artist) => artist.name).join(", ")}</p>
            </div>
          </div>

          {preview ? (
            <PreviewPlayer
              sourceId={track.id}
              url={`/api/preview/${track.id}`}
              title={track.name}
              caption={preview.label}
            />
          ) : null}

          {details ? <TrackScanner trackId={track.id} trackName={track.name} /> : null}

          {popularity !== null ? (
            <div className={`score-ring ${insight?.tone || "mid"}`} style={scoreStyle}>
              <span>{score}</span>
              <strong>{insight?.label || "Popularity score"}</strong>
              <small>base Spotify: {popularity}/100</small>
            </div>
          ) : null}

          <div className="metrics-grid">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>

          <div className="signal-list">
            {(insight?.signals || ["Clique na faixa para calcular os sinais analíticos."]).map((signal) => (
              <p key={signal}>{signal}</p>
            ))}
          </div>

          <a className="spotify-link" href={track.external_urls.spotify} target="_blank" rel="noreferrer">
            Abrir no Spotify
          </a>
        </>
      ) : null}
    </aside>
  );
}
