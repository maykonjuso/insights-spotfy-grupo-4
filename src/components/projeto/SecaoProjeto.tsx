"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Secao } from "@/lib/projeto-conteudo";
import { Revelar } from "../ui/Revelar";
import { CenaSecao } from "./CenaSecao";
import { IconeSecao } from "./IconeSecao";
import { Minijogo } from "./Minijogo";

type SecaoProjetoProps = {
  secao: Secao;
  total: number;
  /** avisa a página quando esta seção passa a ser a que está sendo lida */
  onVisivel: (id: string) => void;
};

// Cada seção entra quando chega na tela. O observador dispara uma vez por
// elemento e é desligado em seguida: animação de entrada não precisa continuar
// sendo observada, e ficar observando trinta elementos durante toda a rolagem
// custa caro em celular.
export function SecaoProjeto({ secao, total, onVisivel }: SecaoProjetoProps) {
  const alvo = useRef<HTMLElement>(null);
  const [entrou, setEntrou] = useState(false);

  useEffect(() => {
    const elemento = alvo.current;
    if (!elemento || typeof IntersectionObserver === "undefined") {
      setEntrou(true);
      return;
    }

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) setEntrou(true);
        // a seção "atual" é a que ocupa a faixa central da tela
        if (entrada.intersectionRatio > 0.35) onVisivel(secao.id);
      },
      { threshold: [0, 0.35, 0.6], rootMargin: "-20% 0px -35% 0px" },
    );

    observador.observe(elemento);
    return () => observador.disconnect();
  }, [secao.id, onVisivel]);

  return (
    <section
      className={`secao ${entrou ? "is-dentro" : ""}`}
      id={secao.id}
      ref={alvo}
      style={{ "--tom": secao.tom } as CSSProperties}
      aria-labelledby={`${secao.id}-titulo`}
    >
      <CenaSecao tipo={secao.icone} />

      <div className="secao-topo">
        <span className="secao-etiqueta">{secao.etiqueta}</span>
        <span className="secao-contador">
          {String(secao.slide).padStart(2, "0")}
          <i>/{String(total).padStart(2, "0")}</i>
        </span>
      </div>

      <IconeSecao tipo={secao.icone} />

      <h2 id={`${secao.id}-titulo`} className="secao-titulo">
        {secao.titulo.split(" ").map((palavra, indice) => (
          <span key={`${palavra}-${indice}`} style={{ "--p": indice } as CSSProperties}>
            {palavra}{" "}
          </span>
        ))}
      </h2>
      <p className="secao-linha">{secao.linha}</p>

      {secao.metricas ? (
        <div className="metricas">
          {secao.metricas.map((metrica, indice) => (
            <div className="metrica" key={metrica.rotulo} style={{ transitionDelay: `${indice * 90}ms` }}>
              <strong>{metrica.valor}</strong>
              <span>{metrica.rotulo}</span>
              {metrica.fonte ? <small>{metrica.fonte}</small> : null}
            </div>
          ))}
        </div>
      ) : null}

      {secao.paragrafos?.map((paragrafo) => (
        <p className="secao-texto" key={paragrafo.slice(0, 40)}>
          {paragrafo}
        </p>
      ))}

      {secao.lista ? (
        <ul className="secao-lista">
          {secao.lista.map((item, indice) => (
            <li key={item.titulo} style={{ transitionDelay: `${indice * 80}ms` }}>
              <strong>{item.titulo}</strong>
              <span>{item.texto}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {secao.jogo ? <Minijogo tipo={secao.jogo} /> : null}

      {secao.aprofundamentos?.length ? (
        <div className="secao-fundos">
          {secao.aprofundamentos.map((fundo) => (
            <Revelar key={fundo.titulo} titulo={fundo.titulo} resumo={fundo.resumo}>
              <div className="fundo-corpo">
                {fundo.corpo.map((linha) => (
                  <p key={linha.slice(0, 40)}>{linha}</p>
                ))}
              </div>
            </Revelar>
          ))}
        </div>
      ) : null}
    </section>
  );
}
