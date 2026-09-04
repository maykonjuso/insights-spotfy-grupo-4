import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { predict } from '@/lib/model/k11Model';
import { generateExplanation } from '@/lib/model/llmExplanation';
import { TrackFeaturesSchema } from '@/lib/model/schema';

const RequestSchema = z.object({
  track_features: TrackFeaturesSchema,
  genero: z.string().min(1).max(50),
});

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
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
        { error: msg, valid_generos: genero_cats },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}