"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEstadoEspelhado } from "@/components/apresentacao/Apresentacao";
import { GENEROS_DESTAQUE } from "@/lib/model-bridge";
import type { TrackFeatures } from "@/lib/model/types";

export type ResultadoGenero = {
  genero: string;
  score: number;
  hdi_94: [number, number];
};

const MOTIVOS: Record<string, string> = {
  "sem-chave":
    "A explicação escrita está desligada: falta configurar a chave do OpenRouter no arquivo .env.local do servidor.",
  "chave-recusada": "A chave do OpenRouter não foi aceita. Confira se ela está válida no painel do OpenRouter.",
  "sem-credito": "A conta do OpenRouter está sem crédito para gerar a explicação escrita.",
  limite: "O OpenRouter pediu para esperar um pouco antes da próxima explicação. Tente de novo em instantes.",
  falhou: "Não consegui escrever a explicação agora. O número acima continua valendo.",
};

/**
 * Conversa com o modelo: pontua o vetor de features em vários gêneros de uma
 * vez e busca a explicação escrita. Fica separado da tela porque as duas
 * formas de entrar no app terminam na mesma leitura.
 */
export function useVeredito(base: TrackFeatures, generoInicial: string) {
  const pedido = useRef(0);
  const ultimaConsulta = useRef("");
  const jaExplicou = useRef(false);

  // estilo e sliders viajam para quem acompanha: mexer aqui muda a tela de lá
  const [genero, setGenero] = useEstadoEspelhado("veredito:genero", generoInicial);
  const [features, setFeatures] = useEstadoEspelhado<TrackFeatures>("veredito:features", base);
  const [corrida, setCorrida] = useState<ResultadoGenero[]>([]);
  const [exibicao, setExibicao] = useState<{ score: number; hdi: [number, number] } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [explicacao, setExplicacao] = useState<string | null>(null);
  const [motivoSemTexto, setMotivoSemTexto] = useState<string | null>(null);
  const [explicando, setExplicando] = useState(false);
  const [explicacaoVelha, setExplicacaoVelha] = useState(false);

  // trocar de música reinicia a leitura sem remontar a tela
  useEffect(() => {
    setFeatures(base);
    setGenero(generoInicial);
    setCorrida([]);
    setExibicao(null);
    setExplicacao(null);
    setMotivoSemTexto(null);
    ultimaConsulta.current = "";
    jaExplicou.current = false;
  }, [base, generoInicial]);

  const pontuar = useCallback(async (vetor: TrackFeatures, alvo: string) => {
    const assinatura = JSON.stringify([vetor, alvo]);
    if (assinatura === ultimaConsulta.current) return;
    ultimaConsulta.current = assinatura;

    const id = (pedido.current += 1);
    setCalculando(true);
    setErro(null);

    try {
      const resposta = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track_features: vetor,
          generos: Array.from(new Set([alvo, ...GENEROS_DESTAQUE])),
        }),
      });
      const dados = (await resposta.json()) as {
        resultados?: ResultadoGenero[];
        desconhecidos?: string[];
        error?: string;
        details?: unknown;
      };
      if (id !== pedido.current) return;

      if (!resposta.ok) {
        // 400 e vetor recusado (medida fora do dominio); qualquer outro codigo
        // e o servidor. Sem separar os dois, todo problema virava a mesma frase
        // generica e nao dava para saber o que consertar.
        console.error("[veredito] /api/predict", resposta.status, dados.error, dados.details);
        throw new Error(
          resposta.status === 400
            ? "As medidas dessa música saíram fora do esperado e o modelo não conseguiu usá-las."
            : "Não consegui falar com o modelo agora. Tente de novo em instantes.",
        );
      }

      const resultados = dados.resultados ?? [];
      setCorrida(resultados);

      // o estilo digitado na busca pode não existir entre os 107 do modelo;
      // em vez de travar esperando um número que não vem, cai no melhor
      if (dados.desconhecidos?.includes(alvo) && resultados.length > 0) {
        setGenero(resultados[0].genero);
      }
    } catch (falha) {
      if (id !== pedido.current) return;
      setErro(
        falha instanceof Error && falha.message.length > 40
          ? falha.message
          : "Não consegui falar com o modelo agora. Tente de novo em instantes.",
      );
    } finally {
      if (id === pedido.current) setCalculando(false);
    }
  }, []);

  const explicar = useCallback(async (vetor: TrackFeatures, alvo: string) => {
    setExplicando(true);
    setExplicacaoVelha(false);

    try {
      const resposta = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_features: vetor, genero: alvo }),
      });
      const dados = (await resposta.json()) as { explicacao?: string | null; explicacao_status?: string };

      if (dados.explicacao) {
        setExplicacao(dados.explicacao);
        setMotivoSemTexto(null);
      } else {
        setExplicacao(null);
        setMotivoSemTexto(MOTIVOS[dados.explicacao_status ?? "falhou"] ?? MOTIVOS.falhou);
      }
    } catch {
      setExplicacao(null);
      setMotivoSemTexto(MOTIVOS.falhou);
    } finally {
      setExplicando(false);
    }
  }, []);

  // um recálculo por gesto: o atraso curto junta os eventos do dedo no slider
  useEffect(() => {
    const timer = setTimeout(() => void pontuar(features, genero), 200);
    return () => clearTimeout(timer);
  }, [features, genero, pontuar]);

  useEffect(() => {
    const achado = corrida.find((item) => item.genero === genero);
    if (achado) setExibicao({ score: achado.score, hdi: achado.hdi_94 });
  }, [corrida, genero]);

  useEffect(() => {
    if (!exibicao || jaExplicou.current) return;
    jaExplicou.current = true;
    void explicar(features, genero);
  }, [exibicao, features, genero, explicar]);

  return {
    genero,
    features,
    corrida,
    score: exibicao?.score ?? 0,
    hdi: exibicao?.hdi ?? null,
    pronto: exibicao !== null,
    calculando,
    erro,
    explicacao,
    motivoSemTexto,
    explicando,
    explicacaoVelha,
    trocarGenero: (novo: string) => {
      setGenero(novo);
      setExplicacaoVelha(true);
    },
    ajustar: (vetor: TrackFeatures) => {
      setFeatures(vetor);
      setExplicacaoVelha(true);
    },
    reexplicar: () => void explicar(features, genero),
  };
}
