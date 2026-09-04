"use client";

import { seekTo, usePlayerState } from "@/lib/preview-player";
import { PlayButton } from "./PlayButton";

type PreviewPlayerProps = {
  sourceId: string;
  url?: string | null;
  title: string;
};

function tempo(segundos: number) {
  if (!Number.isFinite(segundos) || segundos < 0) return "0:00";
  const minutos = Math.floor(segundos / 60);
  return `${minutos}:${String(Math.floor(segundos % 60)).padStart(2, "0")}`;
}

// Barra fina, para não competir com a capa e o nome da música logo acima.
// O range continua ali por baixo, invisível mas inteiro: é ele que dá o
// arraste com o dedo, o teclado e a leitura por leitor de tela.
export function PreviewPlayer({ sourceId, url, title }: PreviewPlayerProps) {
  const estado = usePlayerState();
  const atual = estado.sourceId === sourceId;
  const duracao = atual ? estado.duration : 0;
  const posicao = atual ? estado.position : 0;
  const progresso = duracao > 0 ? (posicao / duracao) * 100 : 0;

  return (
    <div className={`player ${atual && estado.isPlaying ? "is-tocando" : ""}`}>
      <PlayButton sourceId={sourceId} url={url} title={title} />

      <div className="player-linha">
        <span className="player-trilha" aria-hidden="true">
          <i style={{ width: `${progresso}%` }} />
        </span>

        <input
          type="range"
          min={0}
          max={duracao || 30}
          step={0.1}
          value={posicao}
          disabled={!url || !atual || duracao === 0}
          onChange={(evento) => seekTo(Number(evento.target.value))}
          aria-label={`Posição da reprodução de ${title}`}
        />
      </div>

      <span className="player-tempo">
        {tempo(posicao)}
        <i aria-hidden="true">/</i>
        {tempo(duracao)}
      </span>
    </div>
  );
}
