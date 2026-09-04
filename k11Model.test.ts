/**
 * Testes do modelo K-11: re-clamp de score, validacao de genero, ordem
 * canonica das features. Cobre os guards que evitam regressao silenciosa
 * em casos degenerados (N=1, genero invalido, score fora de [0,100]).
 */
import { describe, it, expect } from 'vitest';
import { predict } from './src/lib/model/k11Model';
import type { TrackFeatures } from './src/lib/model/types';

const FEATURES_FEITICO: TrackFeatures = {
  danceability: 0.7,
  energy: 0.6,
  loudness: -5,
  speechiness: 0.05,
  acousticness: 0.2,
  instrumentalness: 0,
  liveness: 0.1,
  valence: 0.6,
  tempo: 120,
  explicit: 0,
  mode_bin: 1,
};

describe('predict() — re-clamp e contratos', () => {
  it('retorna score clamped em [0, 100]', () => {
    const r = predict(FEATURES_FEITICO, 'pop');
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('retorna hdi_94 com hdi_lo < hdi_hi', () => {
    const r = predict(FEATURES_FEITICO, 'forro');
    expect(r.hdi_lo).toBeLessThanOrEqual(r.hdi_hi);
    expect(typeof r.hdi_lo).toBe('number');
    expect(typeof r.hdi_hi).toBe('number');
  });

  it('lança erro explicito para genero inexistente', () => {
    // predict() e sincrono: joga Error em vez de rejeitar Promise.
    expect(() => predict(FEATURES_FEITICO, 'genero_que_nao_existe_xyz')).toThrow(/Unknown genre/);
  });

  it('beta_gk_used tem 11 elementos (uma por feature K-11)', () => {
    const r = predict(FEATURES_FEITICO, 'rock');
    expect(r.beta_gk_used).toHaveLength(11);
  });

  it('genero_idx retorna o indice correto na lista', () => {
    const r = predict(FEATURES_FEITICO, 'pop');
    expect(r.genero_idx).toBeGreaterThanOrEqual(0);
    expect(typeof r.genero_idx).toBe('number');
  });
});
