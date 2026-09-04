import OpenAI from 'openai';
import type { Prediction } from './types';

const MODELO = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash-0731';

// Instanciado sob demanda: no topo do modulo, o SDK lanca durante o build
// quando nao ha chave, e derruba a rota inteira -- inclusive o score, que nao
// depende de LLM nenhum.
let cliente: OpenAI | null = null;

// O valor de exemplo do .env.local.example passa por qualquer checagem de
// "variavel existe" e so falha la na frente, com 401. Barrar aqui transforma
// um erro obscuro em uma instrucao clara na tela.
const PLACEHOLDER = 'sk-or-v1-your-key-here';

export function chaveConfigurada() {
  const chave = process.env.OPENROUTER_API_KEY?.trim();
  return Boolean(chave) && chave !== PLACEHOLDER && chave!.startsWith('sk-or-') && chave!.length > 40;
}

function getCliente() {
  if (!chaveConfigurada()) return null;
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

export type Explicacao = {
  texto: string | null;
  /** 'ok' | 'sem-chave' | 'chave-recusada' | 'sem-credito' | 'limite' | 'falhou' */
  status: string;
};

export async function generateExplanation(
  pred: Prediction,
  genero: string,
): Promise<Explicacao> {
  const { getFeatureNames } = await import('./artifacts');
  const feature_names = getFeatureNames();

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
    const bruta = process.env.OPENROUTER_API_KEY?.trim();
    console.warn(
      bruta === PLACEHOLDER || !bruta
        ? '[explicacao] OPENROUTER_API_KEY ausente ou ainda com o valor de exemplo em .env.local'
        : '[explicacao] OPENROUTER_API_KEY com formato inesperado (esperado sk-or-... com mais de 40 caracteres)',
    );
    return { texto: null, status: 'sem-chave' };
  }

  try {
    const resp = await openrouter.chat.completions.create({
      model: MODELO,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.7,
    });
    const texto = resp.choices[0]?.message?.content?.trim();
    if (!texto) return { texto: null, status: 'falhou' };
    return { texto, status: 'ok' };
  } catch (err) {
    // o status do OpenRouter diz exatamente o que resolver; sem isso a tela
    // so consegue dizer "falhou", que foi o que aconteceu ate agora
    const status = (err as { status?: number })?.status;
    const detalhe = (err as { message?: string })?.message ?? String(err);
    console.error(`[explicacao] OpenRouter respondeu ${status ?? 'sem status'}: ${detalhe}`);

    if (status === 401 || status === 403) return { texto: null, status: 'chave-recusada' };
    if (status === 402) return { texto: null, status: 'sem-credito' };
    if (status === 429) return { texto: null, status: 'limite' };
    return { texto: null, status: 'falhou' };
  }
}