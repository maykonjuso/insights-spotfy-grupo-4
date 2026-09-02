import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { PosteriorSamples, PosteriorSummary } from './types';

const ARTIFACTS = path.join(process.cwd(), 'artifacts');

function loadJSON<T>(filename: string): T {
  const raw = fs.readFileSync(path.join(ARTIFACTS, filename), 'utf-8');
  return JSON.parse(raw) as T;
}

function loadGzJSON<T>(filename: string): T {
  const raw = fs.readFileSync(path.join(ARTIFACTS, filename));
  return JSON.parse(zlib.gunzipSync(raw).toString('utf-8')) as T;
}

export const feature_names: string[] = loadJSON('feature_names.json');
export const genero_cats: string[] = loadJSON('genero_cats.json');
export const scaler: Record<string, { mean: number; std: number }> =
  loadJSON('scaler.json');
export const posteriorSummary = loadJSON<PosteriorSummary>('k11_posterior_summary.json');
export const posteriorSamples = loadGzJSON<PosteriorSamples>('k11_posterior_samples.json.gz');