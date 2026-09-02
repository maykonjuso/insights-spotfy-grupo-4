"use client";

import { togglePlayback, usePlayerState } from "@/lib/preview-player";

type PlayButtonProps = {
  sourceId: string;
  url?: string | null;
  title: string;
  size?: "sm" | "lg";
  onFallback?: () => void;
};

export function PlayButton({ sourceId, url, title, size = "sm", onFallback }: PlayButtonProps) {
  const state = usePlayerState();
  const isActive = state.sourceId === sourceId && state.isPlaying;

  // preview_url vem null para credenciais novas da API; nesse caso o botao
  // manda o usuario para o player oficial em vez de nao fazer nada.
  if (!url) {
    return (
      <button
        type="button"
        className={`play-button ${size} ${onFallback ? "is-fallback" : "is-disabled"}`}
        title="Sem prévia de 30s na API. Abrir no player do Spotify."
        aria-label={`Abrir ${title} no player do Spotify`}
        disabled={!onFallback}
        onClick={(event) => {
          event.stopPropagation();
          onFallback?.();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5.5v13l11-6.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`play-button ${size} ${isActive ? "is-playing" : ""}`}
      aria-label={isActive ? `Pausar ${title}` : `Ouvir prévia de ${title}`}
      onClick={(event) => {
        event.stopPropagation();
        void togglePlayback(sourceId, url);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {isActive ? (
          <path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" />
        ) : (
          <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
        )}
      </svg>
    </button>
  );
}
