"use client";

import { durationLabel } from "@/lib/insights";
import { PlayButton } from "./PlayButton";

export type TrackSummary = {
  id: string;
  name: string;
  popularity?: number;
  duration_ms: number;
  explicit: boolean;
  preview_url?: string | null;
  external_urls: { spotify: string };
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    release_date: string;
    images: { url: string; height: number | null; width: number | null }[];
  };
};

type TrackListProps = {
  tracks: TrackSummary[];
  isLoading: boolean;
  selectedTrackId?: string;
  onSelectTrack: (track: TrackSummary, options?: { focusPlayer?: boolean }) => void;
};

function cover(track: TrackSummary) {
  return track.album.images.at(-1)?.url || track.album.images[0]?.url;
}

export function TrackList({ tracks, isLoading, selectedTrackId, onSelectTrack }: TrackListProps) {
  return (
    <section className="panel track-panel">
      <div className="section-heading">
        <p>Etapa 2</p>
        <h2>Tracks em destaque</h2>
      </div>

      {isLoading ? (
        <div className="skeleton-list" aria-label="Carregando músicas">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="track-skeleton" key={index} />
          ))}
        </div>
      ) : (
        <div className="track-list">
          {tracks.length === 0 ? (
            <p className="empty-state">Nenhuma faixa encontrada para esse gênero.</p>
          ) : (
            tracks.map((track, index) => (
              <div
                key={track.id}
                className={`track-row ${selectedTrackId === track.id ? "is-selected" : ""}`}
              >
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <PlayButton
                  sourceId={track.id}
                  url={track.preview_url}
                  title={track.name}
                  onFallback={() => onSelectTrack(track, { focusPlayer: true })}
                />
                <button type="button" className="track-select" onClick={() => onSelectTrack(track)}>
                  {cover(track) ? (
                    <img src={cover(track)} alt={`Capa de ${track.album.name}`} />
                  ) : (
                    <span className="cover-fallback" />
                  )}
                  <span className="track-copy">
                    <strong>{track.name}</strong>
                    <span>{track.artists.map((artist) => artist.name).join(", ")}</span>
                  </span>
                  <span className="track-meta">
                    <strong>{typeof track.popularity === "number" ? track.popularity : "N/D"}</strong>
                    <span>{durationLabel(track.duration_ms)}</span>
                  </span>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
