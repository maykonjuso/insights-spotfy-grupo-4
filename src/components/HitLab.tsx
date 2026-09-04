"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeSamples } from "@/lib/audio-analysis";
import { decodeAudioFile } from "@/lib/audio-decode";
import type { AudioSummary } from "@/lib/audio-features";
import type { EssentiaDescriptors } from "@/lib/essentia-analysis";
import { genreLabel, type GenreScore } from "@/lib/genre-classifier";
import { durationLabel } from "@/lib/insights";
import { GENEROS_DESTAQUE, modelGenreFor, toModelFeatures } from "@/lib/model-bridge";
import type { TrackFeatures } from "@/lib/model/types";
import { stopPlayback } from "@/lib/preview-player";
import { buildSoundFeatures } from "@/lib/sound-features";
import { AnalysisStages, type EtapaAnalise } from "./AnalysisStages";
import { GenreRace, type ResultadoGenero } from "./GenreRace";
import { PreviewPlayer } from "./PreviewPlayer";
import { ScoreDial } from "./ScoreDial";
import { SoundFeatureGrid } from "./SoundFeatureGrid";
import { WhatIfPanel } from "./WhatIfPanel";

type Fase = "drop" | "analisando" | "resultado";

type Leitura = {
  nomeArquivo: string;
  objectUrl: string;
  durationMs: number;
  clippedSamples: number;
  summary: AudioSummary | null;
  descriptors: EssentiaDescriptors | null;
  descriptorsError?: string;
  generos: GenreScore[];
};

function faixaDeScore(score: number) {
  if (score >= 60) return "Potencial alto";
  if (score >= 35) return "Potencial médio";
  return "Potencial baixo";
}

// Só pico e clipping: energia, loudness e o resto vêm do extrator completo.
function medirPicos(canal: Float32Array) {
  const passo = Math.max(1, Math.floor(canal.length / 220_000));
  let pico = 0;
  let clipadas = 0;

  for (let indice = 0; indice < canal.length; indice += passo) {
    const absoluto = Math.abs(canal[indice]);
    if (absoluto > pico) pico = absoluto;
    if (absoluto >= 0.98) clipadas += 1;
  }

  return { pico, clipadas };
}

export function HitLab() {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);
  const pedido = useRef(0);
  const ultimaPontuacao = useRef("");

  const [fase, setFase] = useState<Fase>("drop");
  const [etapa, setEtapa] = useState<EtapaAnalise>("decodificar");
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [base, setBase] = useState<TrackFeatures | null>(null);
  const [features, setFeatures] = useState<TrackFeatures | null>(null);
  const [genero, setGenero] = useState("pop");
  const [catalogo, setCatalogo] = useState<string[]>([]);

  const [corrida, setCorrida] = useState<ResultadoGenero[]>([]);
  const [pontuando, setPontuando] = useState(false);
  const [explicacao, setExplicacao] = useState<string | null>(null);
  const [explicando, setExplicando] = useState(false);
  const [explicacaoVelha, setExplicacaoVelha] = useState(false);

  // O score exibido so troca quando chega resultado para o genero atual: trocar
  // de genero pelo seletor deixaria o mostrador cair a zero por uma fracao de
  // segundo ate a resposta chegar, e a animacao faria disso um solavanco.
  const [exibicao, setExibicao] = useState<{ score: number; hdi: [number, number] } | null>(null);

  useEffect(() => {
    const achado = corrida.find((item) => item.genero === genero);
    if (achado) setExibicao({ score: achado.score, hdi: achado.hdi_94 });
  }, [corrida, genero]);

  useEffect(() => {
    return () => {
      stopPlayback();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  // lista completa de gêneros que o modelo conhece (107), para trocar a análise
  useEffect(() => {
    fetch("/api/generos")
      .then((resposta) => resposta.json())
      .then((dados: { generos?: string[] }) => setCatalogo(dados.generos ?? []))
      .catch(() => setCatalogo([]));
  }, []);

  const pontuar = useCallback(
    async (vetor: TrackFeatures, generoAlvo: string) => {
      const assinatura = JSON.stringify([vetor, generoAlvo]);
      if (assinatura === ultimaPontuacao.current) return;
      ultimaPontuacao.current = assinatura;

      const id = (pedido.current += 1);
      setPontuando(true);

      const generos = Array.from(new Set([generoAlvo, ...GENEROS_DESTAQUE]));

      try {
        const resposta = await fetch("/api/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track_features: vetor, generos }),
        });
        const dados = (await resposta.json()) as { resultados?: ResultadoGenero[]; error?: string };
        if (id !== pedido.current) return;
        if (!resposta.ok) throw new Error(dados.error || "Falha ao consultar o modelo.");
        setCorrida(dados.resultados ?? []);
      } catch (falha) {
        if (id !== pedido.current) return;
        setErro(falha instanceof Error ? falha.message : "Falha ao consultar o modelo.");
      } finally {
        if (id === pedido.current) setPontuando(false);
      }
    },
    [],
  );

  const explicar = useCallback(async (vetor: TrackFeatures, generoAlvo: string) => {
    setExplicando(true);
    setExplicacaoVelha(false);

    try {
      const resposta = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_features: vetor, genero: generoAlvo }),
      });
      const dados = (await resposta.json()) as { explicacao?: string; error?: string };
      if (!resposta.ok) throw new Error(dados.error || "Falha ao gerar a explicação.");
      setExplicacao(dados.explicacao ?? null);
    } catch {
      setExplicacao(null);
    } finally {
      setExplicando(false);
    }
  }, []);

  // Cada arrasto de slider dispara um recálculo; o atraso curto junta os
  // eventos do dedo numa chamada só e mantém a sensação de tempo real.
  useEffect(() => {
    if (fase !== "resultado" || !features) return;
    const timer = setTimeout(() => void pontuar(features, genero), 200);
    return () => clearTimeout(timer);
  }, [features, genero, fase, pontuar]);

  async function analisar(arquivo: File) {
    stopPlayback();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);

    setErro(null);
    setFase("analisando");
    setEtapa("decodificar");
    setExplicacao(null);
    setCorrida([]);

    try {
      const { buffer, monoSamples } = await decodeAudioFile(arquivo);
      const { pico, clipadas } = medirPicos(buffer.getChannelData(0));

      setEtapa("espectro");
      const { classification, descriptors, descriptorsError } = await analyzeSamples(monoSamples);

      setEtapa("genero");
      const generos = classification && buffer.duration >= 5 ? classification.scores.slice(0, 3) : [];
      const sugerido = modelGenreFor(generos[0]?.genre);

      const summary = classification?.summary ?? null;
      const vetor = toModelFeatures({ summary, descriptors });
      if (!vetor) throw new Error("Não consegui extrair o espectro deste arquivo.");

      const url = URL.createObjectURL(arquivo);
      objectUrl.current = url;

      setLeitura({
        nomeArquivo: arquivo.name,
        objectUrl: url,
        durationMs: buffer.duration * 1000,
        clippedSamples: clipadas,
        summary: summary ? { ...summary, peak: pico } : null,
        descriptors,
        descriptorsError,
        generos,
      });
      setBase(vetor);
      setFeatures(vetor);
      setGenero(sugerido);

      setEtapa("modelo");
      await pontuar(vetor, sugerido);
      setFase("resultado");
      void explicar(vetor, sugerido);
    } catch (falha) {
      setFase("drop");
      setErro(
        falha instanceof Error && falha.message.includes("espectro")
          ? falha.message
          : `Não consegui ler "${arquivo.name}". Tente um MP3, WAV, M4A, OGG ou FLAC.`,
      );
    }
  }

  function trocarGenero(novo: string) {
    setGenero(novo);
    setExplicacaoVelha(true);
  }

  function ajustar(vetor: TrackFeatures) {
    setFeatures(vetor);
    setExplicacaoVelha(true);
  }

  function recomecar() {
    stopPlayback();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setFase("drop");
    setLeitura(null);
    setBase(null);
    setFeatures(null);
    setCorrida([]);
    setExibicao(null);
    setExplicacao(null);
    setErro(null);
    ultimaPontuacao.current = "";
  }

  if (fase === "analisando") {
    return <AnalysisStages atual={etapa} nomeArquivo={leitura?.nomeArquivo ?? "sua faixa"} />;
  }

  if (fase === "drop") {
    return (
      <section className="panel lab-drop">
        <div className="section-heading">
          <p>Passo 1</p>
          <h2>Envie a música que você quer testar</h2>
        </div>

        <div
          className={`upload-dropzone ${arrastando ? "is-dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(evento) => {
            evento.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(evento) => {
            evento.preventDefault();
            setArrastando(false);
            const arquivo = evento.dataTransfer.files[0];
            if (arquivo) void analisar(arquivo);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/flac"
            aria-label="Escolher arquivo de áudio"
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) void analisar(arquivo);
              evento.target.value = "";
            }}
          />
          <span>Toque para escolher, ou arraste aqui</span>
          <strong>MP3, WAV, M4A, OGG ou FLAC</strong>
        </div>

        {erro ? <p className="error-banner">{erro}</p> : null}

        <p className="upload-note">
          O áudio nunca sai do seu aparelho: espectro, ritmo e gênero são calculados no próprio navegador.
          Só as 11 medidas resultantes vão ao servidor para consultar o modelo.
        </p>
      </section>
    );
  }

  if (!leitura || !features || !base) return null;

  const score = exibicao?.score ?? 0;
  const hdi = exibicao?.hdi ?? null;

  return (
    <div className="lab-resultado">
      <section className="panel lab-topo">
        <div className="lab-arquivo">
          <p className="album-label">Sua faixa</p>
          <h2>{leitura.nomeArquivo}</h2>
          <p className="lab-duracao">
            {durationLabel(leitura.durationMs)}
            {leitura.descriptors ? ` · ${Math.round(leitura.descriptors.bpm)} bpm · ${leitura.descriptors.key} ${leitura.descriptors.scale === "minor" ? "menor" : "maior"}` : ""}
          </p>
        </div>

        <ScoreDial
          score={score}
          hdi={hdi}
          legenda={faixaDeScore(score)}
          detalhe={`popularidade prevista em ${genero}, com 94% de credibilidade`}
          ocupado={pontuando}
        />

        <PreviewPlayer
          sourceId="lab-upload"
          url={leitura.objectUrl}
          title={leitura.nomeArquivo}
          caption="Tocando localmente"
        />

        <div className="lab-genero">
          <p className="album-label">Gênero da análise</p>

          <div className="genre-chips">
            {leitura.generos.map((item) => {
              const alvo = modelGenreFor(item.genre);
              return (
                <button
                  type="button"
                  key={item.genre}
                  className={`genre-chip ${alvo === genero ? "is-active" : ""}`}
                  onClick={() => trocarGenero(alvo)}
                >
                  {genreLabel(item.genre)}
                  <small>{Math.round(item.probability * 100)}%</small>
                </button>
              );
            })}
            {leitura.generos.length === 0 ? (
              <p className="upload-note">Áudio curto demais para reconhecer o gênero — escolha abaixo.</p>
            ) : null}
          </div>

          <label className="genero-select" htmlFor="genero-modelo">
            <span>Testar em outro gênero</span>
            <select
              id="genero-modelo"
              value={genero}
              onChange={(evento) => trocarGenero(evento.target.value)}
            >
              {(catalogo.length ? catalogo : [genero]).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel lab-explicacao" aria-live="polite">
        <div className="section-heading">
          <p>Leitura</p>
          <h2>O que puxa esse número</h2>
        </div>

        {explicando ? (
          <div className="texto-esqueleto" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {!explicando && explicacao ? <p className="lab-texto">{explicacao}</p> : null}
        {!explicando && !explicacao ? (
          <p className="upload-note">
            A explicação em texto depende de uma chave de LLM configurada no servidor; o score acima é
            calculado de qualquer jeito.
          </p>
        ) : null}

        {explicacaoVelha && !explicando ? (
          <button type="button" className="scan-button" onClick={() => void explicar(features, genero)}>
            Explicar esta versão
          </button>
        ) : null}
      </section>

      <WhatIfPanel features={features} base={base} onChange={ajustar} onReset={() => ajustar(base)} />

      <GenreRace resultados={corrida} generoAtual={genero} carregando={pontuando} onEscolher={trocarGenero} />

      <section className="panel">
        <div className="section-heading">
          <p>Medidas</p>
          <h2>O que foi medido no áudio</h2>
        </div>

        <SoundFeatureGrid
          groups={buildSoundFeatures({
            summary: leitura.summary,
            descriptors: leitura.descriptors,
            durationMs: leitura.durationMs,
            clippedSamples: leitura.clippedSamples,
          })}
        />

        {leitura.descriptors ? null : (
          <p className="upload-note">
            Descritores da Essentia indisponíveis
            {leitura.descriptorsError ? ` (${leitura.descriptorsError})` : ""} — a leitura acima usa só o DSP
            próprio, e o andamento e o tom entram como estimativa.
          </p>
        )}
      </section>

      {erro ? <p className="error-banner">{erro}</p> : null}

      <button type="button" className="cta-secondary" onClick={recomecar}>
        Analisar outra música
      </button>
    </div>
  );
}
