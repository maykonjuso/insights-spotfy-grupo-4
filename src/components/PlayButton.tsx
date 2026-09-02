"use client";

import { togglePlayback, usePlayerState } from "@/lib/preview-player";

type PlayButtonProps = {
  sourceId: string;
  url?: string | null;
  title: string;
  size?: "sm" | "lg";
};

export function PlayButton({ sourceId, url, title, size = "sm" }: PlayButtonProps) {
  const state = usePlayerState();
  const isActive = state.sourceId === sourceId && state.isPlaying;

  // estado defensivo: a lista so traz faixas com previa, mas o upload pode
  // chegar aqui antes da URL existir
  if (!url) {
    return (
      <button
        type="button"
        className={`play-button ${size} is-disabled`}
        title="Áudio ainda indisponível para esta faixa."
        aria-label={`Áudio indisponível para ${title}`}
        disabled
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
