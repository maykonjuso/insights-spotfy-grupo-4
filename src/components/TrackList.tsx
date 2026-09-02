"use client";

import { durationLabel } from "@/lib/insights";

export type TrackSummary = {
  id: string;
  name: string;
  popularity?: number;
  duration_ms: number;
  explicit: boolean;
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
  onSelectTrack: (track: TrackSummary) => void;
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
              <button
                type="button"
                key={track.id}
                className={`track-row ${selectedTrackId === track.id ? "is-selected" : ""}`}
                onClick={() => onSelectTrack(track)}
              >
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                {cover(track) ? <img src={cover(track)} alt={`Capa de ${track.album.name}`} /> : <span className="cover-fallback" />}
                <span className="track-copy">
                  <strong>{track.name}</strong>
                  <span>{track.artists.map((artist) => artist.name).join(", ")}</span>
                </span>
                <span className="track-meta">
                  <strong>{typeof track.popularity === "number" ? track.popularity : "N/D"}</strong>
                  <span>{durationLabel(track.duration_ms)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  );
}
