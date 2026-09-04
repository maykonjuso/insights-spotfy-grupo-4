"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useEstadoEspelhado } from "../apresentacao/Apresentacao";

type RevelarProps = {
  titulo: string;
  resumo: string;
  children: ReactNode;
  abertoInicial?: boolean;
};

// precisa bater com a duracao da transicao de `.revelar-caixa` no CSS
const DURACAO = 320;

// Detalhe sob demanda. A tela de resultado responde a pergunta principal de
// cara; tudo que e aprofundamento fica fechado, com um resumo de uma linha
// dizendo o que tem dentro, para ninguem precisar abrir para descobrir.
export function Revelar({ titulo, resumo, children, abertoInicial = false }: RevelarProps) {
  // A chave sai do título porque ele é estável e único dentro de uma página, e
  // é o que faz abrir aqui abrir também na tela de quem acompanha.
  const [aberto, setAberto] = useEstadoEspelhado(`revelar:${titulo}`, abertoInicial);
  // O conteudo continua montado durante o fechamento, senao ele sumiria de uma
  // vez e a altura animaria sozinha, sem nada dentro. Fechado de vez, ele sai
  // do DOM: e o que evita reconstruir a grade de medidas e a corrida de estilos
  // a cada evento de arrasto dos sliders da simulacao.
  const [montado, setMontado] = useState(abertoInicial);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  useEffect(() => {
    if (relogio.current) clearTimeout(relogio.current);

    if (aberto) {
      setMontado(true);
      return;
    }

    relogio.current = setTimeout(() => setMontado(false), DURACAO);
    return () => {
      if (relogio.current) clearTimeout(relogio.current);
    };
  }, [aberto]);

  return (
    <section className={`revelar ${aberto ? "is-aberto" : ""}`}>
      <button
        type="button"
        className="revelar-botao"
        onClick={() => setAberto(!aberto)}
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

      {/* A caixa anima de 0fr a 1fr: e o jeito de transicionar ate a altura do
          conteudo sem precisar medi-la em JavaScript, e funciona nos dois
          sentidos, abrindo e fechando. */}
      {/* inert em vez de aria-hidden: durante o fechamento o conteudo ainda
          esta no DOM, e aria-hidden sobre um elemento que contem o foco e um
          erro de acessibilidade. inert tira do foco e da leitura de uma vez. */}
      <div className="revelar-caixa" id={id} role="region" inert={!aberto}>
        <div className="revelar-corpo">{montado ? children : null}</div>
      </div>
    </section>
  );
}
