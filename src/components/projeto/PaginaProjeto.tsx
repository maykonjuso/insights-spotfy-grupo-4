"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useApresentacao } from "@/components/apresentacao/Apresentacao";
import { SECOES, TOTAL_SECOES } from "@/lib/projeto-conteudo";
import { SecaoProjeto } from "./SecaoProjeto";

export function PaginaProjeto() {
  const [atual, setAtual] = useState(SECOES[0].id);
  const { seguindo, transmitindo, transmitir } = useApresentacao();
  const ultimaSecao = useRef("");

  // Acompanhando: a seção vem de quem transmite e a rolagem é comandada.
  // Sozinho: a seção sai da rolagem da própria pessoa.
  const marcar = useCallback(
    (id: string) => {
      if (seguindo) return;
      setAtual(id);
    },
    [seguindo],
  );

  useEffect(() => {
    const alvo = seguindo?.secao;
    if (!alvo || alvo === ultimaSecao.current) return;
    ultimaSecao.current = alvo;
    setAtual(alvo);
    document.getElementById(alvo)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [seguindo?.secao]);

  // transmitindo daqui: publica a seção que estou lendo
  useEffect(() => {
    if (!transmitindo) return;
    transmitir({ rota: "/projeto", secao: atual });
  }, [transmitindo, atual, transmitir]);

  const indice = Math.max(0, SECOES.findIndex((secao) => secao.id === atual));
  const progresso = ((indice + 1) / TOTAL_SECOES) * 100;

  function irPara(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="projeto">
      {/* Trilha de progresso e índice por pontos: em celular o índice lateral
          não cabe, então ele vira uma coluna estreita de pontos na borda. */}
      <div className="projeto-barra" aria-hidden="true">
        <i style={{ transform: `scaleX(${progresso / 100})` }} />
      </div>

      <header className="projeto-topo">
        <Link href="/" className="projeto-voltar">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Abrir o app
        </Link>
        <span className="projeto-marca">Como isso foi feito</span>
      </header>

      <nav className="projeto-indice" aria-label="Seções">
        {SECOES.map((secao) => (
          <button
            type="button"
            key={secao.id}
            className={secao.id === atual ? "is-atual" : ""}
            onClick={() => irPara(secao.id)}
            aria-current={secao.id === atual ? "true" : undefined}
            aria-label={`Ir para ${secao.titulo}`}
          >
            <span>{secao.etiqueta}</span>
          </button>
        ))}
      </nav>

      <div className="projeto-corpo">
        {SECOES.map((secao) => (
          <SecaoProjeto key={secao.id} secao={secao} total={TOTAL_SECOES} onVisivel={marcar} />
        ))}

        <footer className="projeto-fim">
          <p>Grupo 4 · análise de dados do Spotify</p>
          <Link href="/" className="btn-principal">
            Testar uma música
          </Link>
        </footer>
      </div>
    </main>
  );
}
