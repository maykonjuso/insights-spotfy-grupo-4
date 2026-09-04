import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { predict } from '@/lib/model/k11Model';
import { TrackFeaturesSchema } from '@/lib/model/schema';

// Irmao rapido de /api/diagnose: mesmo modelo, sem a chamada ao LLM e aceitando
// varios generos de uma vez. E o que sustenta os sliders "e se..." e a corrida
// de generos na tela -- cada resposta custa 1000 x 11 multiplicacoes por genero,
// entao da para chamar a cada arrasto de dedo sem pesar no servidor.
const RequestSchema = z.object({
  track_features: TrackFeaturesSchema,
  generos: z.array(z.string().min(1).max(50)).min(1).max(24),
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

  // generos desconhecidos sao ignorados em vez de derrubar o lote inteiro: a
  // tela manda listas montadas no cliente e uma entrada ruim nao pode zerar o resto
  const resultados = [];
  const desconhecidos: string[] = [];

  for (const genero of parsed.data.generos) {
    try {
      const p = predict(parsed.data.track_features, genero);
      resultados.push({ genero, score: p.score, hdi_94: [p.hdi_lo, p.hdi_hi] });
    } catch {
      desconhecidos.push(genero);
    }
  }

  if (resultados.length === 0) {
    const { genero_cats } = await import('@/lib/model/artifacts');
    return NextResponse.json(
      { error: 'Nenhum gênero válido', desconhecidos, valid_generos: genero_cats },
      { status: 400 },
    );
  }

  return NextResponse.json({
    resultados: resultados.sort((a, b) => b.score - a.score),
    desconhecidos,
    ms: Date.now() - t0,
  });
}
