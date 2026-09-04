import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { PosteriorSamples, PosteriorSummary } from './types';

// Carregamento preguicoso, e nao no topo do modulo.
//
// `k11_posterior_samples.json.gz` tem 12 MB comprimidos e vira mais de um
// milhao de numeros em memoria. Quando isso rodava no import, a etapa
// "Collecting page data" do `next build` -- que importa toda rota, em varios
// workers ao mesmo tempo -- estourava a memoria e derrubava o build com erros
// enganosos ("Cannot find module './331.js'", "/_document nao encontrado").
// Agora o posterior so e lido na primeira chamada de verdade, uma vez por
// processo, e o build nao toca nele.
const ARTIFACTS = path.join(process.cwd(), 'artifacts');

function loadJSON<T>(filename: string): T {
  const raw = fs.readFileSync(path.join(ARTIFACTS, filename), 'utf-8');
  return JSON.parse(raw) as T;
}

function loadGzJSON<T>(filename: string): T {
  const raw = fs.readFileSync(path.join(ARTIFACTS, filename));
  return JSON.parse(zlib.gunzipSync(raw).toString('utf-8')) as T;
}

function memo<T>(carregar: () => T): () => T {
  let valor: T | undefined;
  return () => {
    if (valor === undefined) valor = carregar();
    return valor;
  };
}

export const getFeatureNames = memo<string[]>(() => loadJSON('feature_names.json'));

export const getGeneroCats = memo<string[]>(() => loadJSON('genero_cats.json'));

export const getScaler = memo<Record<string, { mean: number; std: number }>>(() =>
  loadJSON('scaler.json'),
);

export const getPosteriorSummary = memo<PosteriorSummary>(() =>
  loadJSON<PosteriorSummary>('k11_posterior_summary.json'),
);

export const getPosteriorSamples = memo<PosteriorSamples>(() =>
  loadGzJSON<PosteriorSamples>('k11_posterior_samples.json.gz'),
);
