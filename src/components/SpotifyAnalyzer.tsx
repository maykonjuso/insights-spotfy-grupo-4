"use client";

import { useEffect, useMemo, useState } from "react";
import { buildTrackInsight } from "@/lib/insights";
import { GenreSelector } from "./GenreSelector";
import { UploadAnalyzer } from "./UploadAnalyzer";
import { TrackList, type TrackSummary } from "./TrackList";
import { PopularityInsights, type TrackDetails } from "./PopularityInsights";

type TracksResponse = {
  genre: string;
  tracks: TrackSummary[];
  error?: string;
};

const DEFAULT_GENRES = ["pop", "k-pop", "hip-hop", "rock", "latino", "chill", "sad", "metal"];

export function SpotifyAnalyzer() {
  const [genres, setGenres] = useState(DEFAULT_GENRES);
  const [selectedGenre, setSelectedGenre] = useState("pop");
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackDetails | null>(null);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topTrack = useMemo(() => tracks[0], [tracks]);

  function localTrackDetails(track: TrackSummary): TrackDetails {
    return {
      track,
      features: null,
      insight: buildTrackInsight(track, null),
    };
  }

  useEffect(() => {
    fetch("/api/genres")
      .then((response) => response.json())
      .then((data: { genres?: string[] }) => {
        if (data.genres?.length) setGenres(data.genres);
      })
      .catch(() => setGenres(DEFAULT_GENRES));
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTracks() {
      setIsLoadingTracks(true);
      setSelectedTrack(null);
      setError(null);

      try {
        const response = await fetch(`/api/tracks?genre=${encodeURIComponent(selectedGenre)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as TracksResponse;

        if (!response.ok) {
          throw new Error(data.error || "Falha ao buscar faixas.");
        }

        setTracks(data.tracks);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setTracks([]);
        setError(err instanceof Error ? err.message : "Erro inesperado.");
      } finally {
        setIsLoadingTracks(false);
      }
    }

    loadTracks();
    return () => controller.abort();
  }, [selectedGenre]);

  async function handleSelectTrack(track: TrackSummary, options?: { focusPlayer?: boolean }) {
    if (options?.focusPlayer) {
      document.getElementById("analise")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    setIsLoadingInsight(true);
    setError(null);
    setSelectedTrack(localTrackDetails(track));

    try {
      const response = await fetch(`/api/tracks/${track.id}`);
      const data = (await response.json()) as TrackDetails & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Falha ao analisar faixa.");
      }

      setSelectedTrack(data);
    } catch {
      setSelectedTrack(localTrackDetails(track));
    } finally {
      setIsLoadingInsight(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span>Popularity Lab</span>
        </div>

        <div className="hero-copy">
          <p className="eyebrow">Spotify Web API · análise de mercado musical</p>
          <h1>Descubra os indicativos de popularidade de uma música.</h1>
          <p>
            Envie suas músicas para classificação automática de gênero e leitura técnica, ou selecione um gênero
            para ouvir e comparar referências do catálogo do Spotify em decisões de produção e posicionamento.
          </p>
        </div>

        <div className="hero-stats" aria-label="Resumo da busca atual">
          <div>
            <strong>{selectedGenre}</strong>
            <span>gênero ativo</span>
          </div>
          <div>
            <strong>{tracks.length || "--"}</strong>
            <span>faixas encontradas</span>
          </div>
          <div>
            <strong>{topTrack ? topTrack.popularity ?? "N/D" : "--"}</strong>
            <span>maior popularity</span>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="control-column">
          <UploadAnalyzer />
          <GenreSelector genres={genres} selectedGenre={selectedGenre} onSelect={setSelectedGenre} />
          {error ? <p className="error-banner">{error}</p> : null}
          <TrackList
            tracks={tracks}
            isLoading={isLoadingTracks}
            selectedTrackId={selectedTrack?.track.id}
            onSelectTrack={handleSelectTrack}
          />
        </div>

        <PopularityInsights details={selectedTrack} isLoading={isLoadingInsight} fallbackTrack={topTrack} />
      </section>
    </main>
  );
}
