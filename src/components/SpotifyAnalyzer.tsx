"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildTrackInsight, durationLabel } from "@/lib/insights";
import { stopPlayback } from "@/lib/preview-player";
import { GenreSelector } from "./GenreSelector";
import { LandingHero } from "./LandingHero";
import { PopularityInsights, type TrackDetails } from "./PopularityInsights";
import { TrackList, type TrackSummary } from "./TrackList";
import { HitLab } from "./HitLab";
import { WizardHeader } from "./WizardHeader";

type TracksResponse = {
  genre: string;
  tracks: TrackSummary[];
  error?: string;
};

type Etapa = "landing" | "genero" | "faixa" | "analise" | "upload";

const DEFAULT_GENRES = ["pop", "k-pop", "hip-hop", "rock", "latino", "chill", "sad", "metal"];

const PASSO: Record<Etapa, number> = { landing: 0, genero: 1, faixa: 2, analise: 3, upload: 0 };

export function SpotifyAnalyzer() {
  const [etapa, setEtapa] = useState<Etapa>("landing");
  const [direcao, setDirecao] = useState<"avancar" | "voltar">("avancar");
  const [genres, setGenres] = useState(DEFAULT_GENRES);
  const [selectedGenre, setSelectedGenre] = useState("");
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackDetails | null>(null);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duracaoMedia = useMemo(() => {
    if (tracks.length === 0) return "--";
    return durationLabel(tracks.reduce((total, track) => total + track.duration_ms, 0) / tracks.length);
  }, [tracks]);

  const navegar = useCallback((proxima: Etapa, sentido: "avancar" | "voltar" = "avancar") => {
    setDirecao(sentido);
    setEtapa(proxima);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    fetch("/api/genres")
      .then((response) => response.json())
      .then((data: { genres?: string[] }) => {
        if (data.genres?.length) setGenres(data.genres);
      })
      .catch(() => setGenres(DEFAULT_GENRES));
  }, []);

  useEffect(() => {
    if (!selectedGenre) return;
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

        if (!response.ok) throw new Error(data.error || "Falha ao buscar faixas.");

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

  function escolherGenero(genre: string) {
    setSelectedGenre(genre);
    navegar("faixa");
  }

  async function escolherFaixa(track: TrackSummary) {
    stopPlayback();
    setIsLoadingInsight(true);
    setError(null);
    setSelectedTrack({ track, features: null, insight: buildTrackInsight(track, null) });
    navegar("analise");

    try {
      const response = await fetch(`/api/tracks/${track.id}`);
      const data = (await response.json()) as TrackDetails & { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao analisar faixa.");
      setSelectedTrack(data);
    } catch {
      setSelectedTrack({ track, features: null, insight: buildTrackInsight(track, null) });
    } finally {
      setIsLoadingInsight(false);
    }
  }

  function voltar() {
    stopPlayback();
    if (etapa === "analise") return navegar("faixa", "voltar");
    if (etapa === "faixa") return navegar("genero", "voltar");
    return navegar("landing", "voltar");
  }

  const passo = PASSO[etapa];

  return (
    <main className={`app-shell ${etapa === "landing" ? "is-landing" : ""}`}>
      {passo > 0 ? (
        <WizardHeader
          etapa={passo}
          total={3}
          rotuloVoltar={etapa === "analise" ? "Voltar para a lista de músicas" : "Voltar"}
          titulo={
            etapa === "genero"
              ? "Escolha um gênero"
              : etapa === "faixa"
                ? "Escolha a música"
                : selectedTrack?.track.name || "Análise"
          }
          subtitulo={
            etapa === "genero"
              ? "A busca só traz faixas com prévia de áudio disponível."
              : etapa === "faixa"
                ? `${selectedGenre} · ${tracks.length || "--"} faixas · ${duracaoMedia} em média`
                : selectedTrack?.track.artists.map((artista) => artista.name).join(", ")
          }
          onBack={voltar}
        />
      ) : null}

      {etapa === "upload" ? (
        <div className="wizard-topbar">
          <button type="button" className="wizard-back" onClick={voltar} aria-label="Voltar para o início">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span>Testar minha música</span>
        </div>
      ) : null}

      <div className={`step ${direcao === "voltar" ? "is-voltando" : ""}`} key={etapa}>
        {etapa === "landing" ? (
          <LandingHero onStart={() => navegar("genero")} onUpload={() => navegar("upload")} />
        ) : null}

        {etapa === "genero" ? (
          <GenreSelector genres={genres} selectedGenre={selectedGenre} onSelect={escolherGenero} />
        ) : null}

        {etapa === "faixa" ? (
          <>
            {error ? <p className="error-banner">{error}</p> : null}
            <TrackList
              tracks={tracks}
              isLoading={isLoadingTracks}
              selectedTrackId={selectedTrack?.track.id}
              onSelectTrack={escolherFaixa}
            />
          </>
        ) : null}

        {etapa === "analise" ? (
          <PopularityInsights details={selectedTrack} isLoading={isLoadingInsight} />
        ) : null}

        {etapa === "upload" ? <HitLab /> : null}
      </div>
    </main>
  );
}
