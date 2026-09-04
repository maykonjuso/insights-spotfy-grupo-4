import OpenAI from 'openai';
import type { Prediction } from './types';

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  timeout: 10_000, // 10s — evita que OpenRouter lento bloqueie o worker (Wave 4 M6)
});

const FEATURE_NAMES_PT: Record<string, string> = {
  danceability: 'dançabilidade',
  energy: 'energia',
  loudness: 'volume (loudness)',
  speechiness: 'presença de fala',
  acousticness: 'acusticidade',
  instrumentalness: 'presença de instrumentos',
  liveness: 'audiência ao vivo',
  valence: 'positividade',
  tempo: 'tempo (BPM)',
  explicit: 'conteúdo explícito',
  mode_bin: 'tom (maior/menor)',
};

// Resultado que carrega tambem a origem: "llm" se veio do modelo, "fallback"
// se foi mensagem padrao (sem OPENROUTER_API_KEY ou erro de rede). Wave 4 M3
// pediu um flag explicito pro cliente distinguir sucesso de fallback.
export type GenerateExplanationResult = {
  text: string;
  source: 'llm' | 'fallback';
};

export async function generateExplanation(
  pred: Prediction,
  genero: string,
): Promise<GenerateExplanationResult> {
  const { feature_names } = await import('./artifacts');

  // Pegar top 3 features por |beta_gk|
  const indexed = pred.beta_gk_used.map((b, i) => ({
    name: feature_names[i],
    beta: b,
    abs: Math.abs(b),
  }));
  indexed.sort((a, b) => b.abs - a.abs);
  const top3 = indexed.slice(0, 3);

  const featureList = top3
    .map(
      (f) =>
        `- ${FEATURE_NAMES_PT[f.name] || f.name}: efeito ${f.beta > 0 ? 'positivo' : 'negativo'} (β=${f.beta.toFixed(2)})`,
    )
    .join('\n');

  // Wave 4 M7: prepended caveat lembra o LLM que o modelo e fraco e que
  // precisa fazer hedge. Sem isso, o LLM escreve "dancabilidade puxa pra
  // cima" como se fosse ground truth.
  const hdiWidth = pred.hdi_hi - pred.hdi_lo;
  const uncertainNote = hdiWidth >= 30
    ? '\nATENCAO: HDI 94% deste diagnostico e LARGO (>=30 pontos), o que indica que o modelo esta INCERTO. Diga isso explicitamente ao usuario. Use linguagem como "o modelo nao tem certeza" ou "resultado indica faixa ampla".'
    : '';

  const prompt = `LEMBRETE: O modelo K-11 Bayesiano deste diagnostico tem R^2=0.15 e HDI coverage empirica=0.40 (ou seja, em 60% dos casos o valor real esta FORA do intervalo de 94%). Trate o score como INDICATIVO, nao como predicao. Use linguagem cautelosa ("sugere", "tende a", "pode indicar") em vez de causalidade deterministica.${uncertainNote}

Voce explica diagnostico musical para um usuario leigo em PT-BR. Seja direto, use 2-3 frases curtas, sem jargao estatistico.

Genero: ${genero}
Score previsto: ${pred.score} (intervalo de credibilidade 94%: ${pred.hdi_lo} a ${pred.hdi_hi}, largura ${hdiWidth} pontos)

Top 3 features que mais influenciam este score neste genero:
${featureList}

Explique de forma acessivel o que esta puxando o score para cima ou para baixo, COM HEDGE.`;

  // Se a key nao esta configurada, cai no fallback direto (sem fazer a
  // chamada HTTP — evita 401 ruidoso nos logs do upstream).
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.includes('PLACEHOLDER')) {
    return {
      text: '(Sem LLM configurado) Este audio tem score previsto de ' + pred.score + ' em ' + genero + '. O modelo K-11 calculou um intervalo de credibilidade 94% de ' + pred.hdi_lo + ' a ' + pred.hdi_hi + '. Configure OPENROUTER_API_KEY no .env.local para obter explicacao em linguagem natural.',
      source: 'fallback',
    };
  }

  try {
    const resp = await openrouter.chat.completions.create({
      model: 'deepseek/deepseek-v4-flash-0731',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.7,
    });
    return {
      text: resp.choices[0].message.content ?? 'Explicacao indisponivel no momento.',
      source: 'llm',
    };
  } catch (err) {
    console.error('[/api/diagnose] LLM error:', err);
    return {
      text: '(Explicacao automatica temporariamente indisponivel; o score foi calculado, mas a interpretacao em texto falhou. Tente novamente em alguns segundos.)',
      source: 'fallback',
    };
  }
}
