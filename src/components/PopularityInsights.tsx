"use client";

import { useEffect, type CSSProperties } from "react";
import { buildTrackInsight, durationLabel } from "@/lib/insights";
import { currentSourceId, stopPlayback } from "@/lib/preview-player";
import type { AudioFeatures, SpotifyTrack } from "@/lib/spotify";
import type { TrackSummary } from "./TrackList";
import { PreviewPlayer } from "./PreviewPlayer";
import { SpotifyEmbed } from "./SpotifyEmbed";
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
    audioFeaturesAvailable: boolean;
  };
};

type PopularityInsightsProps = {
  details: TrackDetails | null;
  fallbackTrack?: TrackSummary;
  isLoading: boolean;
};

function artwork(track?: SpotifyTrack | TrackSummary) {
  return track?.album.images[1]?.url || track?.album.images[0]?.url;
}

function metricLabel(value?: number, suffix = "%") {
  if (typeof value !== "number") return "--";
  if (suffix === "bpm") return `${Math.round(value)} bpm`;
  return `${Math.round(value * 100)}${suffix}`;
}

export function PopularityInsights({ details, fallbackTrack, isLoading }: PopularityInsightsProps) {
  const track = details?.track || fallbackTrack;
  const features = details?.features;
  const insight = details?.insight;
  const preview = details?.preview;
  const image = artwork(track);
  const score = insight?.score ?? (track ? buildTrackInsight(track, null).score : 0);
  const scoreStyle = { "--score": score } as CSSProperties;
  const popularityLabel = typeof track?.popularity === "number" ? String(track.popularity) : "Não disponível";
  const trackId = track?.id;

  // trocar de faixa corta a previa anterior; continuar a mesma faixa nao.
  useEffect(() => {
    if (trackId && currentSourceId() && currentSourceId() !== trackId) stopPlayback();
  }, [trackId]);

  return (
    <aside className="insight-card" id="analise">
      <div className="section-heading">
        <p>Etapa 3</p>
        <h2>Análise de popularidade</h2>
      </div>

      {isLoading ? <div className="insight-loading">Analisando sinais da faixa...</div> : null}

      {!track && !isLoading ? (
        <p className="empty-state">Selecione um gênero e toque em uma música para ver o painel analítico.</p>
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

          <SpotifyEmbed trackId={track.id} trackName={track.name} />

          <TrackScanner trackId={track.id} trackName={track.name} hasAudio={Boolean(preview)} />

          <div className={`score-ring ${insight?.tone || "mid"}`} style={scoreStyle}>
            <span>{score}</span>
            <strong>{insight?.label || "Popularity score"}</strong>
            <small>base Spotify: {popularityLabel}/100</small>
          </div>

          <div className="metrics-grid">
            <div>
              <span>Popularidade</span>
              <strong>{popularityLabel}</strong>
            </div>
            <div>
              <span>Duração</span>
              <strong>{durationLabel(track.duration_ms)}</strong>
            </div>
            <div>
              <span>Dançabilidade</span>
              <strong>{metricLabel(features?.danceability)}</strong>
            </div>
            <div>
              <span>Energia</span>
              <strong>{metricLabel(features?.energy)}</strong>
            </div>
            <div>
              <span>Valência</span>
              <strong>{metricLabel(features?.valence)}</strong>
            </div>
            <div>
              <span>Tempo</span>
              <strong>{metricLabel(features?.tempo, "bpm")}</strong>
            </div>
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
