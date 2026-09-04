"use client";

import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";

type ScoreDialProps = {
  score: number;
  hdi: [number, number] | null;
  legenda: string;
  detalhe?: string;
  ocupado?: boolean;
};

const RAIO = 78;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
// medidor de 270 graus: sobra espaco embaixo para o rotulo sem apertar o numero
const ARCO = CIRCUNFERENCIA * 0.75;

// Tom do score dial considera a largura do HDI: se o intervalo de credibilidade
// for largo demais, o modelo nao sabe, e a cor vira "incerto" (independente
// do score). Sem isso, score 60 com HDI [10,90] ficava "mid" verde-claro e o
// usuario achava que o modelo tinha razao.
const HDI_LARGURA_INCERTA = 30;
const HDI_LARGURA_MUITO_INCERTA = 50;

function tom(score: number, hdi?: [number, number] | null) {
  const largura = hdi ? hdi[1] - hdi[0] : 0;
  if (largura >= HDI_LARGURA_MUITO_INCERTA) return "uncertain";
  if (largura >= HDI_LARGURA_INCERTA) {
    if (score >= 60) return "high";
    if (score >= 35) return "mid";
    return "low";
  }
  if (score >= 60) return "high";
  if (score >= 35) return "mid";
  return "low";
}

export function ScoreDial({ score, hdi, legenda, detalhe, ocupado }: ScoreDialProps) {
  const animado = useAnimatedNumber(score);
  const preenchido = ARCO * (Math.max(0, Math.min(100, animado)) / 100);
  const faixaInicio = hdi ? ARCO * (hdi[0] / 100) : 0;
  const faixaTamanho = hdi ? ARCO * ((hdi[1] - hdi[0]) / 100) : 0;

  return (
    // role="img" com rotulo proprio em vez de aria-live: o numero muda a cada
    // arrasto de slider e um live region leria cada quadro da animacao.
    <div
      className={`score-dial is-${tom(score, hdi)} ${ocupado ? "is-ocupado" : ""}`}
      role="img"
      aria-label={
        hdi
          ? `Score ${score} de 100. ${legenda}. Intervalo de credibilidade de 94%: ${hdi[0]} a ${hdi[1]}.`
          : `Score ${score} de 100. ${legenda}.`
      }
    >
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <g transform="rotate(135 100 100)">
          <circle
            className="dial-trilha"
            cx="100"
            cy="100"
            r={RAIO}
            strokeDasharray={`${ARCO} ${CIRCUNFERENCIA}`}
          />
          {hdi ? (
            <circle
              className="dial-faixa"
              cx="100"
              cy="100"
              r={RAIO}
              strokeDasharray={`${faixaTamanho} ${CIRCUNFERENCIA}`}
              strokeDashoffset={-faixaInicio}
            />
          ) : null}
          <circle
            className="dial-valor"
            cx="100"
            cy="100"
            r={RAIO}
            strokeDasharray={`${preenchido} ${CIRCUNFERENCIA}`}
          />
        </g>
      </svg>

      <div className="dial-centro">
        <strong>{Math.round(animado)}</strong>
        <span>{legenda}</span>
        {hdi ? (
          <small>
            entre {hdi[0]} e {hdi[1]}
          </small>
        ) : null}
      </div>

      {detalhe ? <p className="dial-detalhe">{detalhe}</p> : null}
    </div>
  );
}
