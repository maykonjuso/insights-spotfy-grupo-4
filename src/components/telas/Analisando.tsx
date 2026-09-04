"use client";

import { useEffect, useState } from "react";
import type { EtapaAnalise } from "@/lib/analisar";

const PASSOS: { id: EtapaAnalise; label: string }[] = [
  { id: "abrindo", label: "Abrindo o áudio" },
  { id: "ouvindo", label: "Escutando a música" },
  { id: "estilo", label: "Reconhecendo o estilo" },
  { id: "modelo", label: "Comparando com 89 mil músicas" },
];

// Enquanto espera, tem algo para ler. São fatos do próprio estudo, então a
// espera também ensina o que o número da próxima tela significa.
const CURIOSIDADES = [
  "As características do som explicam pouco da popularidade sozinhas. O estilo pesa muito mais.",
  "Músicas animadas demais não vencem sempre: a relação entre energia e sucesso tem um ponto de virada.",
  "A mesma música vale notas diferentes em estilos diferentes, porque o público de cada um é outro.",
  "Feliz ou triste quase não muda a popularidade. O que muda é onde a música é lançada.",
];

type AnalisandoProps = {
  etapa: EtapaAnalise;
  nome: string;
};

export function Analisando({ etapa, nome }: AnalisandoProps) {
  const [curiosidade, setCuriosidade] = useState(0);
  const indiceAtual = PASSOS.findIndex((passo) => passo.id === etapa);

  useEffect(() => {
    const timer = setInterval(() => {
      setCuriosidade((atual) => (atual + 1) % CURIOSIDADES.length);
    }, 3600);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="tela analisando" aria-live="polite">
      <div className="onda" aria-hidden="true">
        {Array.from({ length: 13 }, (_, indice) => (
          <i key={indice} style={{ animationDelay: `${indice * 70}ms` }} />
        ))}
      </div>

      <div className="tela-copy analisando-copy">
        <h2>Escutando {nome}</h2>
        <p>{PASSOS[Math.max(0, indiceAtual)]?.label}</p>
      </div>

      <div className="passos">
        {PASSOS.map((passo, indice) => (
          <span
            key={passo.id}
            className={indice <= indiceAtual ? "is-feito" : ""}
            aria-hidden="true"
          />
        ))}
      </div>

      <p className="curiosidade" key={curiosidade}>
        {CURIOSIDADES[curiosidade]}
      </p>
    </section>
  );
}
