import { z } from 'zod';

// Mesmos limites do dataset de treino; compartilhado por /api/diagnose e
// /api/predict para que as duas rotas nunca aceitem vetores diferentes.
export const TrackFeaturesSchema = z.object({
  danceability: z.number().min(0).max(1),
  energy: z.number().min(0).max(1),
  loudness: z.number().min(-60).max(0),
  speechiness: z.number().min(0).max(1),
  acousticness: z.number().min(0).max(1),
  instrumentalness: z.number().min(0).max(1),
  liveness: z.number().min(0).max(1),
  valence: z.number().min(0).max(1),
  tempo: z.number().min(0).max(250),
  // literais em vez de number(): assim o tipo inferido ja e 0 | 1 e casa com
  // TrackFeatures sem cast na fronteira das rotas
  explicit: z.union([z.literal(0), z.literal(1)]),
  mode_bin: z.union([z.literal(0), z.literal(1)]),
});
