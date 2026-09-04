"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";

type ResumoFixoProps = {
  visivel: boolean;
  titulo: string;
  capa?: string;
  genero: string;
  score: number;
  legenda: string;
  calculando: boolean;
  editado: boolean;
};

function tom(score: number) {
  if (score >= 60) return "high";
  if (score >= 35) return "mid";
  return "low";
}

// Some quando o cartao da nota esta na tela, e desce por baixo da barra do topo
// quando ele sai. Existe por causa da simulacao: arrastar um slider la embaixo
// sem ver o numero reagir e mexer no escuro.
export function ResumoFixo({
  visivel,
  titulo,
  capa,
  genero,
  score,
  legenda,
  calculando,
  editado,
}: ResumoFixoProps) {
  // Escondido, o numero acompanha o valor sem contar: animar fora da tela
  // deixava a contagem no meio do caminho quando a barra reaparecia.
  const animado = useAnimatedNumber(score, visivel ? 420 : 0);

  // Vai para o body por portal. A tela de resultado vive dentro de um container
  // que anima com transform, e qualquer ancestral transformado passa a ser o
  // ponto de referencia de um filho `position: fixed` -- a barra grudaria no
  // lugar errado. No body nao ha esse ancestral.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;

  return createPortal(
    <>
      {/* Veu: dissolve o conteudo antes de ele chegar na barra. Sem isso, a
          pagina passava nitida em volta das bordas arredondadas e a barra
          parecia recortada e colada por cima. */}
      <div className={`resumo-veu ${visivel ? "is-visivel" : ""}`} aria-hidden="true" />

      <div
      className={`resumo-fixo is-${tom(score)} ${visivel ? "is-visivel" : ""}`}
      aria-hidden={!visivel}
      // fora da tela ele nao pode receber toque nem foco de teclado
      inert={!visivel}
    >
      {capa ? <img src={capa} alt="" /> : <span className="resumo-capa-vazia" aria-hidden="true" />}

      <span className="resumo-texto">
        <strong>{titulo}</strong>
        <small>
          {genero}
          {editado ? " · sua versão" : ""}
        </small>
      </span>

      <span className={`resumo-nota ${calculando ? "is-ocupado" : ""}`}>
        <strong>{Math.round(animado)}</strong>
        <small>{legenda}</small>
      </span>
      </div>
    </>,
    document.body,
  );
}
