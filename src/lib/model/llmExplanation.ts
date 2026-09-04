import OpenAI from 'openai';
import type { Prediction } from './types';

// Instanciado sob demanda: no topo do modulo, o SDK lanca durante o build
// quando nao ha chave, e derruba a rota inteira -- inclusive o score, que nao
// depende de LLM nenhum.
let cliente: OpenAI | null = null;

function getCliente() {
  if (!process.env.OPENROUTER_API_KEY) return null;
  if (!cliente) {
    cliente = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    });
  }
  return cliente;
}

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

export async function generateExplanation(
  pred: Prediction,
  genero: string,
): Promise<string> {
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

  const prompt = `Você explica diagnóstico musical para um usuário leigo em PT-BR. Seja direto, use 2-3 frases curtas, sem jargão estatístico.

Gênero: ${genero}
Score previsto: ${pred.score} (intervalo de credibilidade 94%: ${pred.hdi_lo} a ${pred.hdi_hi})

Top 3 features que mais influenciam este score neste gênero:
${featureList}

Explique de forma acessível o que está puxando o score para cima ou para baixo.`;

  const openrouter = getCliente();
  if (!openrouter) {
    return 'Explicacao em texto desativada: falta OPENROUTER_API_KEY no servidor. O score e o intervalo acima vem do modelo e nao dependem disso.';
  }

  try {
    const resp = await openrouter.chat.completions.create({
      model: 'deepseek/deepseek-v4-flash-0731',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.7,
    });
    return resp.choices[0].message.content ?? 'Explicação indisponível no momento.';
  } catch (err) {
    console.error('LLM error:', err);
    return 'Explicação automática indisponível; o score foi calculado, mas a interpretação em texto falhou.';
  }
}