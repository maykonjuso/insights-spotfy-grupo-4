import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { predict } from '@/lib/k11Model';
import { generateExplanation } from '@/lib/llmExplanation';

const RequestSchema = z.object({
  track_features: z.object({
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
  }),
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
      explicacao,
      genero: parsed.data.genero,
      ms_per_call: ms,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('Unknown genre')) {
      const { genero_cats } = await import('@/lib/artifacts');
      return NextResponse.json(
        { error: msg, valid_generos: genero_cats },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}