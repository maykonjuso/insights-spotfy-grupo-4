import { getFeatureNames, getGeneroCats, getPosteriorSamples, getScaler } from './artifacts';
import type { TrackFeatures, Prediction } from './types';

export function predict(features: TrackFeatures, genero: string): Prediction {
  const feature_names = getFeatureNames();
  const genero_cats = getGeneroCats();
  const scaler = getScaler();
  const posteriorSamples = getPosteriorSamples();

  // Validar gênero
  const genero_idx = genero_cats.indexOf(genero);
  if (genero_idx === -1) {
    throw new Error(`Unknown genre: ${genero}`);
  }

  // Z-score
  const xScaled = new Float32Array(feature_names.length);
  for (let i = 0; i < feature_names.length; i++) {
    const f = feature_names[i];
    const v = features[f as keyof TrackFeatures] as number;
    if (f === 'explicit' || f === 'mode_bin') {
      xScaled[i] = v;
    } else {
      xScaled[i] = (v - scaler[f].mean) / scaler[f].std;
    }
  }

  // Para cada um dos 1000 samples:
  const N = posteriorSamples.sigma_y.length;
  const predictions = new Float32Array(N);
  const beta_gk_used: number[] = [];

  for (let s = 0; s < N; s++) {
    const alpha_g_s = posteriorSamples.alpha_g[s][genero_idx];
    const beta_g_s = posteriorSamples.beta_g[s][genero_idx];
    if (s === 0) {
      for (let k = 0; k < 11; k++) beta_gk_used.push(beta_g_s[k]);
    }
    let mu_log = alpha_g_s;
    for (let k = 0; k < 11; k++) {
      mu_log += beta_g_s[k] * xScaled[k];
    }
    const y_pred = Math.max(0, Math.min(100, Math.exp(mu_log) - 1));
    predictions[s] = y_pred;
  }

  // Calcular score e HDI. score e re-clamped em [0, 100] por defesa: cada
  // pred por-sample ja esta clampada, mas em caso degenerado (N=1 ou
  // arithmetic overflow) o score poderia quebrar o contrato.
  let sum = 0;
  for (let i = 0; i < N; i++) sum += predictions[i];
  const score = Math.max(0, Math.min(100, sum / N));
  const sorted = Array.from(predictions).sort((a, b) => a - b);
  const hdi_lo = sorted[Math.floor(N * 0.03)];
  const hdi_hi = sorted[Math.floor(N * 0.97)];

  return {
    score: Math.round(score),
    hdi_lo: Math.round(hdi_lo),
    hdi_hi: Math.round(hdi_hi),
    beta_gk_used,
    genero_idx,
  };
}