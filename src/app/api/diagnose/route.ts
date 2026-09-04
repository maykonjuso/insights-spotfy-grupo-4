import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { predict } from '@/lib/model/k11Model';
import { generateExplanation } from '@/lib/model/llmExplanation';
import { TrackFeaturesSchema } from '@/lib/model/schema';

const RequestSchema = z.object({
  track_features: TrackFeaturesSchema,
  genero: z.string().min(1).max(50),
});

// Mapeamento PT-BR para erros de validacao Zod. A API original devolvia
// "Number must be less than or equal to 1" com path "track_features" -- inuteis
// para um artista leigo. Aqui a gente pega o path, identifica a feature, e
// devolve "Dancabilidade deve ser entre 0 e 1." que e o que o humano leigo
// precisa ver.
const FEATURE_LABELS_PT: Record<string, string> = {
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

const FEATURE_RANGES_PT: Record<string, string> = {
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
  const mensagens: string[] = [];
  for (const issue of issues) {
    const caminho = issue.path.join('.');
    if (caminho.startsWith('track_features.')) {
      const feature = caminho.replace('track_features.', '');
      const label = FEATURE_LABELS_PT[feature] ?? feature;
      const faixa = FEATURE_RANGES_PT[feature] ?? '';
      mensagens.push(`${label} deve ser ${faixa}.`);
    } else if (caminho === 'genero') {
      mensagens.push('Gênero é obrigatório e deve ter até 50 caracteres.');
    } else {
      mensagens.push(issue.message);
    }
  }
  return mensagens;
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Body inválido: não é JSON.' },
      { status: 400 },
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos.', details: zodIssuesToPtBR(parsed.error.issues) },
      { status: 400 },
    );
  }

  try {
    const prediction = predict(parsed.data.track_features, parsed.data.genero);
    const explicacao = await generateExplanation(prediction, parsed.data.genero);
    const ms = Date.now() - t0;
    return NextResponse.json({
      score: prediction.score,
      hdi_94: [prediction.hdi_lo, prediction.hdi_hi],
      explicacao: explicacao.texto,
      explicacao_status: explicacao.status,
      genero: parsed.data.genero,
      ms_per_call: ms,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('Unknown genre')) {
      const { getGeneroCats } = await import('@/lib/model/artifacts');
      const genero_cats = getGeneroCats();
      return NextResponse.json(
        {
          error: `Gênero não está entre os 107 suportados pelo K-11.`,
          valid_generos: genero_cats,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
