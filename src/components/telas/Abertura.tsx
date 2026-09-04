"use client";

import { useEffect, useState } from "react";

type AberturaProps = {
  onFim: () => void;
};

// A abertura existe para dar lugar a espera, nao para enfeitar: enquanto a
// animacao roda, o app ja busca as musicas do primeiro estilo e a lista de
// generos do modelo. Quando ela sai, a proxima tela ja tem conteudo.
const DURACAO = 2200;

export function Abertura({ onFim }: AberturaProps) {
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    // sai sozinha: nao ha nada para tocar aqui, e prender alguem numa
    // animacao e o oposito de deixar o app rapido
    const inicioDaSaida = setTimeout(() => setSaindo(true), DURACAO - 320);
    const fim = setTimeout(onFim, DURACAO);

    return () => {
      clearTimeout(inicioDaSaida);
      clearTimeout(fim);
    };
  }, [onFim]);

  return (
    <section
      className={`abertura ${saindo ? "is-saindo" : ""}`}
      role="status"
      aria-label="Abrindo o Popularity Lab"
      onClick={onFim}
    >
      <div className="abertura-halo" aria-hidden="true" />

      <div className="abertura-marca">
        <span className="abertura-disco" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>

        <span className="abertura-equalizador" aria-hidden="true">
          {Array.from({ length: 16 }, (_, indice) => (
            <i key={indice} style={{ animationDelay: `${indice * 55}ms` }} />
          ))}
        </span>

        <h1 className="abertura-nome">
          {"Popularity Lab".split("").map((letra, indice) => (
            <span key={indice} style={{ animationDelay: `${420 + indice * 34}ms` }}>
              {letra === " " ? " " : letra}
            </span>
          ))}
        </h1>

        <p className="abertura-frase">a nota que a sua música tiraria</p>
      </div>
    </section>
  );
}
