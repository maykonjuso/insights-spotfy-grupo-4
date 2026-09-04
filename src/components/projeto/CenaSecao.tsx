"use client";

import type { CSSProperties } from "react";
import type { TipoIcone } from "./IconeSecao";

// Cada seção tem a sua cena de fundo, e cada cena diz alguma coisa sobre o
// assunto dela. Não é papel de parede trocado de cor: a do problema é um
// espalhamento sem padrão, a do processo afunila, a do achado é uma nuvem de
// pontos com uma reta plana em cima, a do modelo são curvas empilhadas.
//
// Tudo é SVG e CSS. A alternativa seria GSAP com ScrollTrigger, uns 90 kB, o
// que brigaria com o resto do projeto: o app inteiro carrega 134 kB.

function pseudoAleatorio(semente: number) {
  // sequência fixa: o desenho é sempre o mesmo, e não pisca entre renders
  let x = Math.sin(semente) * 10000;
  return () => {
    x = Math.sin(x) * 10000;
    return x - Math.floor(x);
  };
}

function Ondas() {
  return (
    <div className="cena cena-ondas">
      {Array.from({ length: 34 }, (_, i) => (
        <i key={i} style={{ animationDelay: `${i * 70}ms` } as CSSProperties} />
      ))}
    </div>
  );
}

function Espalhamento() {
  const rnd = pseudoAleatorio(7);
  return (
    <div className="cena cena-espalha">
      {Array.from({ length: 26 }, (_, i) => (
        <i
          key={i}
          style={
            {
              left: `${rnd() * 100}%`,
              top: `${rnd() * 100}%`,
              animationDelay: `${rnd() * 5}s`,
              animationDuration: `${5 + rnd() * 5}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function Caminho() {
  return (
    <div className="cena cena-caminho">
      <svg viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
        <path className="trilho" d="M-10 150 C 90 150, 90 50, 190 50 S 300 150, 410 60" />
        <path className="trilho is-vivo" d="M-10 150 C 90 150, 90 50, 190 50 S 300 150, 410 60" />
      </svg>
      {[12, 40, 68, 94].map((x, i) => (
        <i key={x} style={{ left: `${x}%`, animationDelay: `${i * 700}ms` } as CSSProperties} />
      ))}
    </div>
  );
}

function Painéis() {
  return (
    <div className="cena cena-paineis">
      <i />
      <i />
    </div>
  );
}

function Aneis() {
  return (
    <div className="cena cena-aneis">
      {Array.from({ length: 4 }, (_, i) => (
        <i key={i} style={{ animationDelay: `${i * 900}ms` } as CSSProperties} />
      ))}
    </div>
  );
}

function Interrogacoes() {
  const rnd = pseudoAleatorio(21);
  return (
    <div className="cena cena-perguntas">
      {Array.from({ length: 14 }, (_, i) => (
        <i
          key={i}
          style={
            {
              left: `${rnd() * 96}%`,
              fontSize: `${18 + rnd() * 40}px`,
              animationDelay: `${rnd() * 8}s`,
              animationDuration: `${9 + rnd() * 7}s`,
            } as CSSProperties
          }
        >
          ?
        </i>
      ))}
    </div>
  );
}

function Funil() {
  const rnd = pseudoAleatorio(33);
  return (
    <div className="cena cena-funil">
      <svg viewBox="0 0 200 200" preserveAspectRatio="none" aria-hidden="true">
        <path className="parede" d="M10 20 L90 110 L90 190" />
        <path className="parede" d="M190 20 L110 110 L110 190" />
      </svg>
      {Array.from({ length: 22 }, (_, i) => (
        <i
          key={i}
          style={
            {
              left: `${10 + rnd() * 80}%`,
              animationDelay: `${rnd() * 6}s`,
              animationDuration: `${4 + rnd() * 3}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function Nuvem() {
  const rnd = pseudoAleatorio(5);
  return (
    <div className="cena cena-nuvem">
      {Array.from({ length: 46 }, (_, i) => (
        <i
          key={i}
          style={
            {
              left: `${rnd() * 100}%`,
              top: `${rnd() * 100}%`,
              animationDelay: `${rnd() * 4}s`,
            } as CSSProperties
          }
        />
      ))}
      {/* a reta plana por cima da nuvem é o achado: não há inclinação */}
      <span className="reta" />
    </div>
  );
}

function Curvas() {
  return (
    <div className="cena cena-curvas">
      <svg viewBox="0 0 400 160" preserveAspectRatio="none" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M0 155 C 110 155, ${120 + i * 12} 20, 200 20 S ${290 - i * 12} 155, 400 155`}
            style={{ animationDelay: `${i * 420}ms` } as CSSProperties}
          />
        ))}
      </svg>
    </div>
  );
}

function Convergencia() {
  return (
    <div className="cena cena-converge">
      {Array.from({ length: 9 }, (_, i) => (
        <i
          key={i}
          style={
            {
              left: `${8 + i * 10.5}%`,
              animationDelay: `${i * 130}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

const CENAS: Record<TipoIcone, () => React.ReactElement> = {
  onda: Ondas,
  duvida: Espalhamento,
  passos: Caminho,
  duplo: Painéis,
  alvo: Aneis,
  perguntas: Interrogacoes,
  funil: Funil,
  dispersao: Nuvem,
  curva: Curvas,
  bandeira: Convergencia,
};

export function CenaSecao({ tipo }: { tipo: TipoIcone }) {
  const Desenho = CENAS[tipo];
  return <Desenho />;
}
