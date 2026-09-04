import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { predict } from '@/lib/k11Model';
import { generateExplanation } from '@/lib/llmExplanation';
import { genero_cats } from '@/lib/artifacts';
import type { TrackFeatures } from '@/lib/types';

const FeatureSchema = z.object({
  danceability: z.number().min(0).max(1),
  energy: z.number().min(0).max(1),
  loudness: z.number().min(-60).max(0),
  speechiness: z.number().min(0).max(1),
  acousticness: z.number().min(0).max(1),
  instrumentalness: z.number().min(0).max(1),
  liveness: z.number().min(0).max(1),
  valence: z.number().min(0).max(1),
  tempo: z.number().min(0).max(250),
  explicit: z.number().int().min(0).max(1),
  mode_bin: z.number().int().min(0).max(1),
});

const RequestSchema = z.object({
  track_features: FeatureSchema,
  genero: z.string().min(1).max(50),
});

export const dynamic = 'force-dynamic';

// Mensagens em PT-BR para erros de validacao Zod (Wave 4 m5: o cliente nao
// precisa saber o path interno "track_features.danceability", e leigo nao
// entende "Number must be less than or equal to 1").
const FEATURE_LABELS_PT: Record<keyof TrackFeatures, string> = {
  danceability: 'Dançabilidade',
  energy: 'Energia',
  loudness: 'Volume (loudness)',
  speechiness: 'Presença de fala',
  acousticness: 'Acusticidade',
  instrumentalness: 'Presença de instrumentos',
  liveness: 'Audiência ao vivo',
  valence: 'Valência (positividade)',
  tempo: 'Tempo (BPM)',
  explicit: 'Conteúdo explícito',
  mode_bin: 'Tom (maior/menor)',
};

const FEATURE_RANGES_PT: Record<keyof TrackFeatures, string> = {
  danceability: 'entre 0 e 1',
  energy: 'entre 0 e 1',
  loudness: 'entre -60 e 0 dB',
  speechiness: 'entre 0 e 1',
  acousticness: 'entre 0 e 1',
  instrumentalness: 'entre 0 e 1',
  liveness: 'entre 0 e 1',
  valence: 'entre 0 e 1',
  tempo: 'entre 0 e 250 BPM',
  explicit: '0 ou 1 (inteiro)',
  mode_bin: '0 ou 1 (inteiro)',
};

function zodIssuesToPtBR(issues: z.ZodIssue[]): string[] {
  const messages: string[] = [];
  for (const issue of issues) {
    const path = issue.path.join('.');
    if (path.startsWith('track_features.')) {
      const feature = path.replace('track_features.', '') as keyof TrackFeatures;
      const label = FEATURE_LABELS_PT[feature] ?? feature;
      const range = FEATURE_RANGES_PT[feature] ?? '';
      messages.push(`${label} deve ser ${range}.`);
    } else if (path === 'genero') {
      messages.push('Gênero é obrigatório e deve ter até 50 caracteres.');
    } else {
      messages.push(issue.message);
    }
  }
  return messages;
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();

  // 1) Parse JSON do body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Body inválido: não é JSON.' },
      { status: 400 },
    );
  }

  // 2) Validação Zod (features fora de range caem aqui)
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    const messages = zodIssuesToPtBR(parsed.error.issues);
    return NextResponse.json(
      {
        error: 'Dados inválidos.',
        details: messages,
      },
      { status: 400 },
    );
  }

  const { track_features, genero } = parsed.data;

  // 3) Validação de gênero
  if (!genero_cats.includes(genero)) {
    return NextResponse.json(
      {
        error: `Gênero "${genero}" não está entre os 107 suportados pelo K-11.`,
        valid_generos: genero_cats,
      },
      { status: 400 },
    );
  }

  // 4) Predição K-11 + explicação LLM
  try {
    const prediction = predict(track_features as TrackFeatures, genero);
    const explicacaoResult = await generateExplanation(prediction, genero);
    const ms_per_call = Date.now() - t0;

    return NextResponse.json({
      score: prediction.score,
      hdi_94: [prediction.hdi_lo, prediction.hdi_hi],
      // Wave 4 M3: explicacao_source flag distingue LLM real de fallback.
      // Cliente pode mostrar "(explicação automática indisponível)" quando
      // source === "fallback" em vez de soar como limitacao do modelo.
      explicacao: explicacaoResult.text,
      explicacao_source: explicacaoResult.source,
      genero,
      ms_per_call,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/diagnose] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
