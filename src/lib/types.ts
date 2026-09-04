export interface TrackFeatures {
  danceability: number;
  energy: number;
  loudness: number;
  speechiness: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  valence: number;
  tempo: number;
  explicit: 0 | 1;
  mode_bin: 0 | 1;
}

export interface Prediction {
  score: number;
  hdi_lo: number;
  hdi_hi: number;
  beta_gk_used: number[];
  genero_idx: number;
}

export interface PosteriorSummary {
  mu_alpha_mean: number;
  mu_alpha_std: number;
  sigma_alpha_mean: number;
  sigma_alpha_std: number;
  mu_beta_mean: number[];
  mu_beta_std: number[];
  sigma_beta_mean: number[];
  sigma_beta_std: number[];
  alpha_g_mean: number[];
  alpha_g_std: number[];
  beta_g_mean: number[];
  beta_g_std: number[];
  sigma_y_mean: number;
  sigma_y_std: number;
}

export interface PosteriorSamples {
  mu_alpha: number[];
  sigma_alpha: number[];
  mu_beta: number[][];
  sigma_beta: number[][];
  alpha_g: number[][];
  beta_g: number[][][];
  sigma_y: number[];
}
