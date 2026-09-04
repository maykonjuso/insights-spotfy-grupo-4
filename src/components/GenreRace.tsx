"use client";

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

export function GenreRace({ resultados, generoAtual, carregando, onEscolher }: GenreRaceProps) {
  const teto = Math.max(40, ...resultados.map((item) => item.hdi_94[1]));

  return (
    <section className="panel lab-race">
      <div className="section-heading">
        <p>Comparação</p>
        <h2>Onde essa faixa iria melhor</h2>
      </div>

      <p className="upload-note">
        O mesmo áudio, pontuado pelo modelo em cada gênero. Os coeficientes mudam por gênero, então a mesma
        música vale scores diferentes dependendo de onde ela é lançada. Toque para trocar o gênero da análise.
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
