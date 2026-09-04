"use client";

import { togglePlayback, usePlayerState } from "@/lib/preview-player";

type PlayButtonProps = {
  sourceId: string;
  url?: string | null;
  title: string;
  size?: "sm" | "lg";
};

// O triangulo fica levemente deslocado para a direita: num circulo, o centro
// optico de um triangulo nao coincide com o centro geometrico, e sem esse
// empurrao ele parece torto para a esquerda.
function Triangulo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.2 5.6c0-.8.9-1.3 1.6-.9l8.1 5.4c.6.4.6 1.4 0 1.8l-8.1 5.4c-.7.4-1.6-.1-1.6-.9z" fill="currentColor" />
    </svg>
  );
}

function Pausa() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="5.5" width="3.2" height="13" rx="1.3" fill="currentColor" />
      <rect x="12.8" y="5.5" width="3.2" height="13" rx="1.3" fill="currentColor" />
    </svg>
  );
}

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
        aria-label={`Áudio indisponível para ${title}`}
        disabled
      >
        <Triangulo />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`play-button ${size} ${isActive ? "is-playing" : ""}`}
      aria-label={isActive ? `Pausar ${title}` : `Ouvir ${title}`}
      onClick={(event) => {
        event.stopPropagation();
        void togglePlayback(sourceId, url);
      }}
    >
      {isActive ? <Pausa /> : <Triangulo />}
    </button>
  );
}
