"use client";

import { useState } from "react";

// Jogos de um toque. A regra que eles seguem: nenhuma rodada, nenhum placar,
// nenhuma contagem de tempo. Quem estiver acompanhando a apresentacao responde
// em tres segundos, ve a resposta e volta a atencao para quem esta falando.

type Opcao = {
  id: string;
  rotulo: string;
  detalhe: string;
  certa: boolean;
};

function Escolha({
  pergunta,
  opcoes,
  licao,
}: {
  pergunta: string;
  opcoes: Opcao[];
  licao: string;
}) {
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const respondeu = escolhida !== null;
  const acertou = opcoes.find((opcao) => opcao.id === escolhida)?.certa ?? false;

  return (
    <div className={`jogo ${respondeu ? "is-respondido" : ""}`}>
      <p className="jogo-pergunta">{pergunta}</p>

      <div className="jogo-opcoes">
        {opcoes.map((opcao) => {
          const estado = !respondeu ? "" : opcao.certa ? "is-certa" : escolhida === opcao.id ? "is-errada" : "is-apagada";
          return (
            <button
              type="button"
              key={opcao.id}
              className={`jogo-opcao ${estado}`}
              onClick={() => !respondeu && setEscolhida(opcao.id)}
              disabled={respondeu}
            >
              <strong>{opcao.rotulo}</strong>
              <span className="jogo-detalhe">{respondeu ? opcao.detalhe : "?"}</span>
            </button>
          );
        })}
      </div>

      {respondeu ? (
        <p className="jogo-licao">
          <b>{acertou ? "Isso." : "Quase."}</b> {licao}
        </p>
      ) : null}
    </div>
  );
}

/** Estilo campeão: números reais das médias por gênero do relatório (Q2). */
function JogoGeneros() {
  return (
    <Escolha
      pergunta="Qual destes tem popularidade média maior no catálogo?"
      opcoes={[
        { id: "metal", rotulo: "Metal", detalhe: "56,4 de média", certa: true },
        { id: "pop", rotulo: "Pop", detalhe: "51,6 de média", certa: false },
      ]}
      licao="Metal fica acima de pop, e k-pop lidera com 59,5. O estilo explica muito mais da popularidade do que qualquer característica do som isolada."
    />
  );
}

/** Feature mais associada: correlações de Spearman reais (q1_correlacoes.csv). */
function JogoFeature() {
  return (
    <Escolha
      pergunta="Das onze medidas, qual tem a maior ligação com popularidade?"
      opcoes={[
        { id: "inst", rotulo: "Ser instrumental", detalhe: "−0,125", certa: true },
        { id: "energia", rotulo: "Energia", detalhe: "−0,015", certa: false },
        { id: "alegria", rotulo: "Ser alegre", detalhe: "−0,010", certa: false },
      ]}
      licao="E mesmo a maior de todas é −0,125, um efeito pequeno. Foi esse resultado que nos levou a modelar por estilo em vez de olhar a característica sozinha."
    />
  );
}

const VETOR_EXEMPLO = {
  danceability: 0.72,
  energy: 0.66,
  loudness: -5.2,
  speechiness: 0.06,
  acousticness: 0.18,
  instrumentalness: 0.02,
  liveness: 0.14,
  valence: 0.61,
  tempo: 122,
  explicit: 0,
  mode_bin: 1,
};

/** Chute a nota: a resposta vem do modelo de verdade, na hora. */
function JogoNota() {
  const [palpite, setPalpite] = useState(50);
  const [resposta, setResposta] = useState<{ kpop: number; pop: number } | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function revelar() {
    setBuscando(true);
    try {
      const r = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_features: VETOR_EXEMPLO, generos: ["k-pop", "pop"] }),
      });
      const d = (await r.json()) as { resultados?: { genero: string; score: number }[] };
      const acha = (g: string) => d.resultados?.find((x) => x.genero === g)?.score ?? 0;
      setResposta({ kpop: acha("k-pop"), pop: acha("pop") });
    } catch {
      setResposta(null);
    } finally {
      setBuscando(false);
    }
  }

  const erro = resposta ? Math.abs(palpite - resposta.kpop) : 0;

  return (
    <div className={`jogo ${resposta ? "is-respondido" : ""}`}>
      <p className="jogo-pergunta">
        Uma faixa dançante, 122 bpm, tom maior, bem masterizada. Que nota ela tira em k-pop?
      </p>

      <div className="jogo-slider">
        <output>{palpite}</output>
        <input
          type="range"
          min={0}
          max={100}
          value={palpite}
          disabled={resposta !== null}
          onChange={(e) => setPalpite(Number(e.target.value))}
          aria-label="Seu palpite para a nota"
        />
      </div>

      {resposta ? (
        <>
          <div className="jogo-placar">
            <span>
              <b>{resposta.kpop}</b> em k-pop
            </span>
            <span>
              <b>{resposta.pop}</b> em pop
            </span>
            <span className={erro <= 10 ? "is-perto" : ""}>
              errou por <b>{erro}</b>
            </span>
          </div>
          <p className="jogo-licao">
            A <b>mesma música</b>, com as mesmas onze medidas, vale notas diferentes conforme o estilo em
            que é lançada. É exatamente por isso que o modelo tem coeficientes próprios para cada um dos
            107 estilos.
          </p>
        </>
      ) : (
        <button type="button" className="jogo-botao" onClick={() => void revelar()} disabled={buscando}>
          {buscando ? "Perguntando ao modelo…" : "Ver o que o modelo diz"}
        </button>
      )}
    </div>
  );
}

export function Minijogo({ tipo }: { tipo: "generos" | "nota" | "feature" }) {
  if (tipo === "generos") return <JogoGeneros />;
  if (tipo === "nota") return <JogoNota />;
  return <JogoFeature />;
}
