"use client";

import { memo } from "react";

export type ResultadoGenero = {
  genero: string;
  score: number;
  hdi_94: [number, number];
};

type GenreRaceProps = {
  resultados: ResultadoGenero[];
  generoAtual: string;
  carregando: boolean;
  onEscolher: (genero: string) => void;
};

function GenreRaceBase({ resultados, generoAtual, carregando, onEscolher }: GenreRaceProps) {
  const teto = Math.max(40, ...resultados.map((item) => item.hdi_94[1]));

  return (
    <section className="bloco">
      <p className="bloco-nota">
        A mesma música vale notas diferentes em cada estilo, porque o público de cada um é outro. Toque num
        estilo para refazer a conta com ele.
      </p>

      {carregando && resultados.length === 0 ? (
        <div className="race-skeleton" aria-hidden="true">
          {Array.from({ length: 6 }, (_, indice) => (
            <span key={indice} style={{ animationDelay: `${indice * 70}ms` }} />
          ))}
        </div>
      ) : null}

      <ol className="race-list">
        {resultados.map((item, indice) => {
          const largura = Math.round((item.score / teto) * 100);
          const atual = item.genero === generoAtual;
          return (
            <li key={item.genero} style={{ animationDelay: `${indice * 45}ms` }}>
              <button
                type="button"
                className={`race-row ${atual ? "is-atual" : ""}`}
                onClick={() => onEscolher(item.genero)}
                aria-current={atual ? "true" : undefined}
              >
                <span className="race-nome">{item.genero}</span>
                <span className="race-trilha">
                  <i style={{ width: `${largura}%` }} />
                </span>
                <strong>{item.score}</strong>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// memo: as props destes blocos nao mudam quando o slider se mexe, entao nao
// ha por que reconstrui-los a cada evento de arrasto.
export const GenreRace = memo(GenreRaceBase);
