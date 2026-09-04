"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVeredito } from "@/hooks/useVeredito";
import type { Musica } from "@/lib/analisar";
import { GENEROS_RECONHECIDOS, reconhecidoDeOuvido } from "@/lib/model-bridge";
import { GenreRace } from "../GenreRace";
import { PreviewPlayer } from "../PreviewPlayer";
import { ScoreDial } from "../ScoreDial";
import { SoundFeatureGrid } from "../SoundFeatureGrid";
import { WhatIfPanel } from "../WhatIfPanel";
import { PensandoIA } from "../ui/PensandoIA";
import { ResumoFixo } from "../ui/ResumoFixo";
import { Revelar } from "../ui/Revelar";
import { Sheet } from "../ui/Sheet";

type ResultadoProps = {
  musica: Musica;
  onRecomecar: () => void;
};

function faixaDeScore(score: number) {
  if (score >= 60) return "Chance alta";
  if (score >= 35) return "Chance média";
  return "Chance baixa";
}

function frase(score: number, genero: string) {
  if (score >= 60) return `Tem tudo para funcionar bem em ${genero}.`;
  if (score >= 35) return `Tem uma chance razoável em ${genero}.`;
  return `Começa em desvantagem em ${genero}.`;
}

export function Resultado({ musica, onRecomecar }: ResultadoProps) {
  const veredito = useVeredito(musica.features, musica.generoInicial);
  const mostradorRef = useRef<HTMLDivElement>(null);
  const [notaNaTela, setNotaNaTela] = useState(true);
  const [folhaAberta, setFolhaAberta] = useState(false);
  const [catalogo, setCatalogo] = useState<string[]>([]);
  const [filtro, setFiltro] = useState("");

  // O gatilho e o mostrador, nao o cartao inteiro: o cartao ainda tem frase,
  // escala e botao de estilo embaixo, entao esperar ele sumir fazia a barra
  // chegar tarde, com o numero fora da tela ha muito tempo.
  //
  // O numero fica a 45% da altura do mostrador. Trocar visivel por "menos de
  // metade aparecendo, ja descontando a barra do topo" faz a troca acontecer
  // no momento em que o numero passa por baixo do cabecalho.
  useEffect(() => {
    const alvo = mostradorRef.current;
    if (!alvo || typeof IntersectionObserver === "undefined") return;

    const observador = new IntersectionObserver(
      ([entrada]) => setNotaNaTela(entrada.intersectionRatio >= 0.5),
      { rootMargin: "-70px 0px 0px 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    observador.observe(alvo);
    return () => observador.disconnect();
  }, [veredito.pronto]);

  useEffect(() => {
    fetch("/api/generos")
      .then((resposta) => resposta.json())
      .then((dados: { generos?: string[] }) => setCatalogo(dados.generos ?? []))
      .catch(() => setCatalogo([]));
  }, []);

  // Dois grupos na folha: primeiro os dez que o app identifica sozinho, depois
  // o resto do catalogo do modelo. Sem essa separacao, escolher "sertanejo" e
  // ver o app dizer "country" na leitura de ouvido parecia contradicao.
  const { doOuvido, doModelo } = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    const passa = (item: string) => !termo || item.includes(termo);

    return {
      doOuvido: GENEROS_RECONHECIDOS.filter((item) => passa(item.valor) || passa(item.rotulo.toLowerCase())),
      doModelo: catalogo.filter((item) => passa(item) && !reconhecidoDeOuvido(item)),
    };
  }, [catalogo, filtro]);

  const melhor = veredito.corrida[0];
  const mexeu = veredito.features !== musica.features;

  function escolherEstilo(valor: string) {
    veredito.trocarGenero(valor);
    setFolhaAberta(false);
    setFiltro("");
  }

  return (
    <section className="tela resultado">
      <ResumoFixo
        visivel={!notaNaTela && veredito.pronto}
        titulo={musica.titulo}
        capa={musica.capa}
        genero={veredito.genero}
        score={veredito.score}
        legenda={faixaDeScore(veredito.score)}
        calculando={veredito.calculando}
        editado={mexeu}
      />

      <header className="musica-topo">
        {musica.capa ? (
          <img src={musica.capa} alt="" className="musica-capa" />
        ) : (
          <span className="musica-capa is-vazia" aria-hidden="true">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9 18V6l10-2v12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="6.6" cy="18" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <circle cx="16.6" cy="16" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </span>
        )}

        <div className="musica-nome">
          <strong>{musica.titulo}</strong>
          <small>{musica.subtitulo}</small>

          {musica.detalhes.length > 0 ? (
            <ul className="musica-dados">
              {musica.detalhes.map((dado) => (
                <li key={dado}>{dado}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>

      {musica.audioUrl ? (
        <div className="player-bloco">
          <PreviewPlayer
            sourceId={musica.id}
            url={musica.audioUrl}
            title={musica.titulo}
            forma={musica.forma}
          />
          {/* sem isto, a duracao de 3:09 na linha de dados briga com os 30s que
              o player toca, e parece defeito */}
          {musica.legendaAudio ? <small className="player-legenda">{musica.legendaAudio}</small> : null}
        </div>
      ) : null}

      <div className="explicacao">
        {veredito.explicando || !veredito.pronto ? <PensandoIA /> : null}

        {!veredito.explicando && veredito.explicacao ? (
          <p className="explicacao-texto">{veredito.explicacao}</p>
        ) : null}

        {!veredito.explicando && !veredito.explicacao && veredito.motivoSemTexto ? (
          <p className="aviso">{veredito.motivoSemTexto}</p>
        ) : null}

        {veredito.explicacaoVelha && !veredito.explicando ? (
          <button type="button" className="btn-secundario" onClick={veredito.reexplicar}>
            Explicar esta versão
          </button>
        ) : null}
      </div>

      <div className="cartao-nota">
        {veredito.pronto ? (
          <>
            <div className="mostrador-alvo" ref={mostradorRef}>
              <ScoreDial
                score={veredito.score}
                hdi={veredito.hdi}
                legenda={faixaDeScore(veredito.score)}
                ocupado={veredito.calculando}
              />
            </div>

            <p className="nota-frase">{frase(veredito.score, veredito.genero)}</p>
            <p className="nota-escala">
              Nota de 0 a 100 em popularidade. O modelo aposta que o valor real fica entre{" "}
              {veredito.hdi?.[0]} e {veredito.hdi?.[1]}.
            </p>
          </>
        ) : (
          <div className="nota-esperando">
            <span className="anel-fantasma" aria-hidden="true" />
            <p>Consultando o modelo…</p>
          </div>
        )}

        {veredito.erro ? (
          <p className="aviso is-erro" role="alert">
            {veredito.erro}
          </p>
        ) : null}

        <button type="button" className="btn-estilo" onClick={() => setFolhaAberta(true)}>
          <span>
            Estilo usado na conta
            <strong>{veredito.genero}</strong>
          </span>
          <span className="btn-estilo-acao" aria-hidden="true">
            Trocar
          </span>
        </button>

        {musica.sugestoes.length > 0 ? (
          <div className="atalhos-estilo">
            {musica.sugestoes.map((sugestao) => (
              <button
                type="button"
                key={sugestao.valor}
                className={`chip ${sugestao.valor === veredito.genero ? "is-ativo" : ""}`}
                onClick={() => escolherEstilo(sugestao.valor)}
              >
                {sugestao.rotulo}
                {sugestao.nota ? <small>{sugestao.nota}</small> : null}
              </button>
            ))}
          </div>
        ) : null}

        {!reconhecidoDeOuvido(veredito.genero) ? (
          <p className="nota-manual">
            Este estilo foi escolha sua. O app não consegue identificá-lo só de ouvir a música, então a
            leitura do som ao lado pode apontar um vizinho parecido.
          </p>
        ) : null}

        {mexeu ? <p className="nota-editada">Você mudou o som. Esta nota é da sua versão.</p> : null}
      </div>

      <div className="reveladores">
        <Revelar
          titulo="Onde ela iria melhor"
          resumo={melhor ? `Melhor estilo agora: ${melhor.genero}` : "Comparação entre estilos"}
        >
          <GenreRace
            resultados={veredito.corrida}
            generoAtual={veredito.genero}
            carregando={veredito.calculando}
            onEscolher={veredito.trocarGenero}
          />
        </Revelar>

        <Revelar titulo="E se a música fosse diferente?" resumo="Mexa no andamento, na energia e no clima">
          <WhatIfPanel
            features={veredito.features}
            base={musica.features}
            onChange={veredito.ajustar}
            onReset={() => veredito.ajustar(musica.features)}
          />
        </Revelar>

        <Revelar titulo="O que foi medido no som" resumo="Andamento, tom, energia e mais">
          <SoundFeatureGrid groups={musica.medidas} />
          {musica.aviso ? <p className="aviso">{musica.aviso}</p> : null}
        </Revelar>
      </div>

      {musica.linkSpotify ? (
        <a className="link-externo" href={musica.linkSpotify} target="_blank" rel="noreferrer">
          Abrir no Spotify
        </a>
      ) : null}

      <div className="barra-acao">
        <button type="button" className="btn-principal" onClick={onRecomecar}>
          Testar outra música
        </button>
      </div>

      {/* children de um componente sao avaliados mesmo quando ele devolve null,
          entao a folha fechada ainda montava os 107 botoes a cada render */}
      {folhaAberta ? (
      <Sheet aberta titulo="Escolher o estilo" onFechar={() => setFolhaAberta(false)}>
        <div className="campo-busca is-folha">
          <span aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.9" />
              <path d="M16 16l4 4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            value={filtro}
            onChange={(evento) => setFiltro(evento.target.value)}
            placeholder="Filtrar estilos…"
            aria-label="Filtrar estilos"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {doOuvido.length > 0 ? (
          <>
            <p className="grupo-titulo">O app reconhece de ouvido</p>
            <ul className="lista-estilos">
              {doOuvido.map((item) => (
                <li key={item.valor}>
                  <button
                    type="button"
                    className={item.valor === veredito.genero ? "is-ativo" : ""}
                    onClick={() => escolherEstilo(item.valor)}
                  >
                    {item.rotulo}
                    {item.valor === veredito.genero ? <span aria-hidden="true">✓</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {doModelo.length > 0 ? (
          <>
            <p className="grupo-titulo">
              Outros estilos do modelo
              <small>A nota sai certinho, mas o estilo é escolha sua: o app não identifica estes ouvindo.</small>
            </p>
            <ul className="lista-estilos">
              {doModelo.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    className={item === veredito.genero ? "is-ativo" : ""}
                    onClick={() => escolherEstilo(item)}
                  >
                    {item}
                    {item === veredito.genero ? <span aria-hidden="true">✓</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {doOuvido.length === 0 && doModelo.length === 0 ? (
          <p className="aviso">Nenhum estilo com esse nome.</p>
        ) : null}
      </Sheet>
      ) : null}
    </section>
  );
}
