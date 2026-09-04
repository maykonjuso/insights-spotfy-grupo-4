"use client";

import { useState } from "react";

/**
 * O aviso de que a nota é um indicativo fraco, e não uma previsão.
 *
 * A informação veio do honesty pass e é importante demais para sumir, mas
 * estava como um parágrafo em negrito acima do próprio número: competia com a
 * nota e era a primeira coisa que se lia. Aqui ela vira um selo discreto que
 * abre sob demanda, com os três números que sustentam a afirmação em vez de
 * um bloco de texto corrido.
 *
 * Os valores saem de relatorio/analises/resultados/q11_summary.json.
 */
const NUMEROS = [
  {
    valor: "15%",
    texto: "do que faz uma música ser popular é o que este modelo consegue explicar",
  },
  {
    valor: "19",
    texto: "pontos de erro médio, numa escala que vai até 100",
  },
  {
    valor: "40%",
    texto: "das vezes o valor real cai dentro do intervalo, que promete 94%",
  },
];

export function SeloHonestidade() {
  const [aberto, setAberto] = useState(false);

  return (
    <div className={`selo ${aberto ? "is-aberto" : ""}`}>
      <button
        type="button"
        className="selo-toque"
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
      >
        <span className="selo-glifo" aria-hidden="true">
          i
        </span>
        indicativo, não previsão
        <span className="selo-seta" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      <div className="selo-caixa" inert={!aberto}>
        <div className="selo-corpo">
          {NUMEROS.map((item, indice) => (
            <p key={item.valor} style={{ transitionDelay: `${indice * 70}ms` }}>
              <b>{item.valor}</b>
              <span>{item.texto}</span>
            </p>
          ))}

          <small>
            É um sinal para comparar faixas entre si e para decidir onde olhar, não um número para
            apostar. O que decide popularidade fora do áudio, como divulgação, playlist e momento, o
            modelo não vê.
          </small>
        </div>
      </div>
    </div>
  );
}
