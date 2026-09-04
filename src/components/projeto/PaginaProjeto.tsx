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
  const tom = SECOES[indice]?.tom ?? "#1ed760";
  const progresso = ((indice + 1) / TOTAL_SECOES) * 100;

  return (
    <main className="projeto" style={{ "--tom": tom } as React.CSSProperties}>
      {/* A cor da tela acompanha a seção. `background-color` transiciona
          sozinho; um gradiente não transicionaria, então a forma do brilho vem
          de uma máscara e só a cor muda. */}
      <div className="projeto-tom" aria-hidden="true" />
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
