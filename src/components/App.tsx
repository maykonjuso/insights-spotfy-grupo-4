"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { analisarArquivo, analisarFaixa, ErroAmigavel, type EtapaAnalise, type Musica } from "@/lib/analisar";
import { ESTILO_INICIAL, prefetch } from "@/lib/catalogo";
import { stopPlayback } from "@/lib/preview-player";
import { Abertura } from "./telas/Abertura";
import { Analisando } from "./telas/Analisando";
import { BuscarMusica, type Faixa } from "./telas/BuscarMusica";
import { EnviarMusica } from "./telas/EnviarMusica";
import { Inicio } from "./telas/Inicio";
import { Resultado } from "./telas/Resultado";
import { useApresentacao } from "./apresentacao/Apresentacao";
import { TopBar } from "./ui/TopBar";

type Tela = "abertura" | "inicio" | "enviar" | "buscar" | "analisando" | "resultado";

const TITULOS: Record<Tela, string> = {
  abertura: "Popularity Lab",
  inicio: "Popularity Lab",
  enviar: "Enviar música",
  buscar: "Procurar música",
  analisando: "Analisando",
  resultado: "Resultado",
};

export function App() {
  const urlLocal = useRef<string | null>(null);

  const [tela, setTela] = useState<Tela>("abertura");
  const [voltarPara, setVoltarPara] = useState<Tela>("inicio");
  const [etapa, setEtapa] = useState<EtapaAnalise>("abrindo");
  const [nomeEmAnalise, setNomeEmAnalise] = useState("a música");
  const [musica, setMusica] = useState<Musica | null>(null);
  const [genero, setGenero] = useState(ESTILO_INICIAL);
  const [erro, setErro] = useState<string | null>(null);

  // O app não falava com a apresentação: quem apresentava navegava aqui dentro e
  // ninguém era levado junto, porque `tela` é estado local e nunca era
  // publicado nem aplicado.
  const { seguindo, transmitindo, transmitir } = useApresentacao();

  // O trabalho de rede comeca junto com a animacao de abertura, nao depois
  // dela: quando a tela de busca aparece, a lista ja esta em memoria.
  useEffect(() => {
    prefetch(ESTILO_INICIAL);
    void fetch("/api/generos").catch(() => {});
  }, []);

  // acompanhando: a tela vem de quem transmite
  useEffect(() => {
    const alvo = seguindo?.tela as Tela | undefined;
    if (!alvo) return;
    setTela((atual) => (atual === alvo ? atual : alvo));
  }, [seguindo?.tela]);

  // transmitindo: publica a tela em que estou
  useEffect(() => {
    if (!transmitindo) return;
    transmitir({ rota: "/", tela, rolagem: 0 });
  }, [transmitindo, tela, transmitir]);

  const irPara = useCallback((proxima: Tela) => {
    stopPlayback();
    setTela(proxima);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

  function limparUrlLocal() {
    if (urlLocal.current) URL.revokeObjectURL(urlLocal.current);
    urlLocal.current = null;
  }

  async function rodar(origem: Tela, nome: string, tarefa: () => Promise<Musica>) {
    setErro(null);
    setVoltarPara(origem);
    setNomeEmAnalise(nome);
    setEtapa("abrindo");
    irPara("analisando");

    try {
      const resultado = await tarefa();
      limparUrlLocal();
      if (resultado.audioUrl?.startsWith("blob:")) urlLocal.current = resultado.audioUrl;
      setMusica(resultado);
      irPara("resultado");
    } catch (falha) {
      setErro(
        falha instanceof ErroAmigavel
          ? falha.message
          : "Algo deu errado no meio da análise. Tente de novo.",
      );
      irPara(origem);
    }
  }

  function comArquivo(arquivo: File) {
    void rodar("enviar", arquivo.name.replace(/\.[^.]+$/, ""), () => analisarArquivo(arquivo, setEtapa));
  }

  // estilo vazio significa que a musica veio de uma busca por nome; ai quem
  // decide o estilo da analise e o classificador, nao um chip que a pessoa
  // nem chegou a tocar
  function comFaixa(faixa: Faixa, estilo: string) {
    void rodar("buscar", faixa.name, () => analisarFaixa(faixa, estilo, setEtapa));
  }

  function recomecar() {
    limparUrlLocal();
    setMusica(null);
    setErro(null);
    irPara("inicio");
  }

  const mostraTopo = tela !== "inicio" && tela !== "abertura";

  return (
    <main className={`app ${tela === "inicio" || tela === "abertura" ? "is-inicio" : ""}`}>
      {mostraTopo ? (
        <TopBar
          titulo={TITULOS[tela]}
          onVoltar={
            tela === "analisando"
              ? undefined
              : () => {
                  if (tela === "resultado") return irPara(voltarPara);
                  recomecar();
                }
          }
          rotuloVoltar={tela === "resultado" ? "Voltar e escolher outra música" : "Voltar para o início"}
        />
      ) : null}

      {/* Fora do container animado de proposito: `.troca` anima com transform, e
          um ancestral transformado passa a ser o ponto de referencia de um filho
          `position: fixed`. La dentro, a abertura ficava presa na coluna do app
          e sobrava fundo preto nas laterais. */}
      {tela === "abertura" ? <Abertura onFim={() => setTela("inicio")} /> : null}

      <div className="troca" key={tela}>
        {tela === "inicio" ? (
          <Inicio onEnviar={() => irPara("enviar")} onBuscar={() => irPara("buscar")} />
        ) : null}

        {tela === "enviar" ? <EnviarMusica onArquivo={comArquivo} erro={erro} /> : null}

        {tela === "buscar" ? (
          <>
            {erro ? (
              <p className="aviso is-erro" role="alert">
                {erro}
              </p>
            ) : null}
            <BuscarMusica genero={genero} onGenero={setGenero} onEscolher={comFaixa} />
          </>
        ) : null}

        {tela === "analisando" ? <Analisando etapa={etapa} nome={nomeEmAnalise} /> : null}

        {tela === "resultado" && musica ? <Resultado musica={musica} onRecomecar={recomecar} /> : null}
      </div>
    </main>
  );
}
