type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
};

export type SpotifyImage = {
  url: string;
  height: number | null;
  width: number | null;
};

export type SpotifyArtist = {
  id: string;
  name: string;
  external_urls?: { spotify?: string };
};

export type SpotifyTrack = {
  id: string;
  name: string;
  popularity?: number;
  duration_ms: number;
  explicit: boolean;
  preview_url?: string | null;
  external_urls: { spotify: string };
  artists: SpotifyArtist[];
  album: {
    id: string;
    name: string;
    release_date: string;
    images: SpotifyImage[];
  };
};

export type AudioFeatures = {
  danceability?: number;
  energy?: number;
  valence?: number;
  acousticness?: number;
  instrumentalness?: number;
  liveness?: number;
  speechiness?: number;
  tempo?: number;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

export class SpotifyConfigError extends Error {}

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: string,
  ) {
    super(message);
  }
}

function env(name: "SPOTIFY_CLIENT_ID" | "SPOTIFY_CLIENT_SECRET") {
  const value = process.env[name];
  if (!value) {
    throw new SpotifyConfigError(`Missing ${name}`);
  }
  return value;
}

export async function getSpotifyToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.value;
  }

  const credentials = Buffer.from(
    `${env("SPOTIFY_CLIENT_ID")}:${env("SPOTIFY_CLIENT_SECRET")}`,
  ).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new SpotifyApiError(
      `Spotify token request failed with ${response.status}`,
      response.status,
      details,
    );
  }

  const data = (await response.json()) as TokenResponse;
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

export async function spotifyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getSpotifyToken();
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...init?.headers,
    },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new SpotifyApiError(
      `Spotify API request failed with ${response.status}`,
      response.status,
      details,
    );
  }

  return response.json() as Promise<T>;
}

export async function trySpotifyFetch<T>(path: string): Promise<T | null> {
  try {
    return await spotifyFetch<T>(path);
  } catch {
    return null;
  }
}

export function spotifyMarket() {
  return process.env.SPOTIFY_MARKET || "BR";
}
