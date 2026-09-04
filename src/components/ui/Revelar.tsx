"use client";

import { useId, useState, type ReactNode } from "react";

type RevelarProps = {
  titulo: string;
  resumo: string;
  children: ReactNode;
  abertoInicial?: boolean;
};

// Detalhe sob demanda. A tela de resultado responde a pergunta principal de
// cara; tudo que e aprofundamento fica fechado, com um resumo de uma linha
// dizendo o que tem dentro, para ninguem precisar abrir para descobrir.
export function Revelar({ titulo, resumo, children, abertoInicial = false }: RevelarProps) {
  const [aberto, setAberto] = useState(abertoInicial);
  const id = useId();

  return (
    <section className={`revelar ${aberto ? "is-aberto" : ""}`}>
      <button
        type="button"
        className="revelar-botao"
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
        aria-controls={id}
      >
        <span className="revelar-texto">
          <strong>{titulo}</strong>
          <small>{resumo}</small>
        </span>

        <span className="revelar-seta" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {/* Fechado, o conteudo nem e montado. Com `hidden` ele continuava no DOM
          e era reconstruido a cada render da tela; arrastar um slider refazia
          a lista de estilos e a grade de medidas 60 vezes por segundo. */}
      {aberto ? (
        <div className="revelar-corpo" id={id}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
