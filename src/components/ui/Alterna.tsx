"use client";

import { useEffect, useState, type ReactNode } from "react";

type AlternaProps = {
  ligado: boolean;
  children: ReactNode;
};

// precisa bater com a transicao de `.alterna` no CSS
const DURACAO = 280;

/**
 * Envelope para o que liga e desliga durante o uso: entra e sai animado, e
 * quando esta desligado de vez nao existe no DOM.
 *
 * Manter o elemento montado com altura zero parecia bastar, mas nao bastava:
 * ele continuava sendo item do grid pai e o `gap` do pai era aplicado em volta
 * dele. Varios desses somados abriam um vazio grande no fim da pagina de
 * resultado, invisivel porque a opacidade era zero.
 */
export function Alterna({ ligado, children }: AlternaProps) {
  const [montado, setMontado] = useState(ligado);
  const [visivel, setVisivel] = useState(ligado);

  useEffect(() => {
    if (ligado) {
      setMontado(true);
      // um quadro depois de montar, senao o navegador nao tem estado anterior
      // para transicionar e o elemento aparece de uma vez
      const quadro = requestAnimationFrame(() => setVisivel(true));
      return () => cancelAnimationFrame(quadro);
    }

    setVisivel(false);
    const relogio = setTimeout(() => setMontado(false), DURACAO);
    return () => clearTimeout(relogio);
  }, [ligado]);

  if (!montado) return null;

  return (
    <span className={`alterna ${visivel ? "is-on" : ""}`} inert={!ligado}>
      <span className="alterna-conteudo">{children}</span>
    </span>
  );
}
