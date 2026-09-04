"use client";

import type { CSSProperties } from "react";
import { seekTo, usePlayerState } from "@/lib/preview-player";
import { PlayButton } from "./PlayButton";

type PreviewPlayerProps = {
  sourceId: string;
  url?: string | null;
  title: string;
  /** envelope do áudio em colunas 0..1; sem ele o player cai numa barra simples */
  forma?: number[];
  /** quando a capa da música já é o botão de tocar, o player não repete um */
  semBotao?: boolean;
};

function tempo(segundos: number) {
  if (!Number.isFinite(segundos) || segundos < 0) return "0:00";
  const minutos = Math.floor(segundos / 60);
  return `${minutos}:${String(Math.floor(segundos % 60)).padStart(2, "0")}`;
}

export function PreviewPlayer({ sourceId, url, title, forma, semBotao }: PreviewPlayerProps) {
  const estado = usePlayerState();
  const atual = estado.sourceId === sourceId;
  const duracao = atual ? estado.duration : 0;
  const posicao = atual ? estado.position : 0;
  const tocando = atual && estado.isPlaying;
  const progresso = duracao > 0 ? posicao / duracao : 0;

  const colunas = forma?.length ? forma : null;
  // Coluna onde a agulha esta agora: so ela e as vizinhas se mexem. Fica em -1
  // enquanto a faixa nao comecou, senao a coluna 0 acenderia parada e viraria
  // um ponto verde solto na ponta esquerda.
  const agulha =
    colunas && atual && duracao > 0
      ? Math.min(colunas.length - 1, Math.floor(progresso * colunas.length))
      : -1;

  return (
    <div className={`player ${tocando ? "is-tocando" : ""} ${semBotao ? "is-sem-botao" : ""}`}>
      {semBotao ? null : <PlayButton sourceId={sourceId} url={url} title={title} />}

      <div className="player-onda">
        {colunas ? (
          <span className="onda-colunas" aria-hidden="true">
            {colunas.map((altura, indice) => {
              // a coluna acende quando a agulha passa por ela
              const passou = indice < agulha;
              const classes = [passou ? "is-ouvida" : "", indice === agulha ? "is-agulha" : ""]
                .filter(Boolean)
                .join(" ");

              return (
                <i
                  key={indice}
                  className={classes}
                  style={
                    {
                      height: `${Math.round(altura * 100)}%`,
                      // escalona a entrada da esquerda para a direita
                      "--i": indice,
                    } as CSSProperties
                  }
                />
              );
            })}
          </span>
        ) : (
          <span className="onda-simples" aria-hidden="true">
            <i style={{ transform: `scaleX(${progresso})` }} />
          </span>
        )}

        {/* o range fica invisível por cima: é ele que dá arraste, teclado e
            leitura por leitor de tela, sem impor a aparência padrão */}
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
        <strong>{tempo(posicao)}</strong>
        {tempo(duracao)}
      </span>
    </div>
  );
}
