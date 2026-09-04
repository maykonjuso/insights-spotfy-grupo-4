"use client";

export const ETAPAS_ANALISE = [
  { id: "decodificar", label: "Lendo o arquivo", detalhe: "Decodificando o áudio no seu aparelho" },
  { id: "espectro", label: "Medindo o espectro", detalhe: "MFCCs, brilho, ritmo e dinâmica" },
  { id: "genero", label: "Reconhecendo o gênero", detalhe: "Classificador treinado no GTZAN" },
  { id: "modelo", label: "Consultando o modelo", detalhe: "1.000 amostras do posterior bayesiano" },
] as const;

export type EtapaAnalise = (typeof ETAPAS_ANALISE)[number]["id"];

type AnalysisStagesProps = {
  atual: EtapaAnalise;
  nomeArquivo: string;
};

export function AnalysisStages({ atual, nomeArquivo }: AnalysisStagesProps) {
  const indiceAtual = ETAPAS_ANALISE.findIndex((etapa) => etapa.id === atual);

  return (
    <section className="panel lab-stages" aria-live="polite">
      <div className="section-heading">
        <p>Analisando</p>
        <h2>{nomeArquivo}</h2>
      </div>

      <ol className="stage-list">
        {ETAPAS_ANALISE.map((etapa, indice) => {
          const estado = indice < indiceAtual ? "feito" : indice === indiceAtual ? "ativo" : "espera";
          return (
            <li key={etapa.id} className={`stage is-${estado}`}>
              <span className="stage-marca" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="stage-texto">
                <strong>{etapa.label}</strong>
                <small>{etapa.detalhe}</small>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="stage-equalizer" aria-hidden="true">
        {Array.from({ length: 9 }, (_, indice) => (
          <i key={indice} style={{ animationDelay: `${indice * 90}ms` }} />
        ))}
      </div>
    </section>
  );
}
