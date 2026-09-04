"use client";

import { useEffect, useMemo, useState } from "react";
import { useVeredito } from "@/hooks/useVeredito";
import type { Musica } from "@/lib/analisar";
import { GenreRace } from "../GenreRace";
import { PreviewPlayer } from "../PreviewPlayer";
import { ScoreDial } from "../ScoreDial";
import { SoundFeatureGrid } from "../SoundFeatureGrid";
import { WhatIfPanel } from "../WhatIfPanel";
import { PensandoIA } from "../ui/PensandoIA";
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
  const [folhaAberta, setFolhaAberta] = useState(false);
  const [catalogo, setCatalogo] = useState<string[]>([]);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    fetch("/api/generos")
      .then((resposta) => resposta.json())
      .then((dados: { generos?: string[] }) => setCatalogo(dados.generos ?? []))
      .catch(() => setCatalogo([]));
  }, []);

  const filtrados = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    if (!termo) return catalogo;
    return catalogo.filter((item) => item.includes(termo));
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
          <PreviewPlayer sourceId={musica.id} url={musica.audioUrl} title={musica.titulo} />
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
            <ScoreDial
              score={veredito.score}
              hdi={veredito.hdi}
              legenda={faixaDeScore(veredito.score)}
              ocupado={veredito.calculando}
            />

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

      <Sheet aberta={folhaAberta} titulo="Escolher o estilo" onFechar={() => setFolhaAberta(false)}>
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

        <ul className="lista-estilos">
          {filtrados.map((item) => (
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
          {filtrados.length === 0 ? <li className="aviso">Nenhum estilo com esse nome.</li> : null}
        </ul>
      </Sheet>
    </section>
  );
}
