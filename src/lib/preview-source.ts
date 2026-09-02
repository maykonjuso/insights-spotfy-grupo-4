import type { SpotifyTrack } from "./spotify";

export type PreviewMatch = {
  url: string;
  source: "spotify" | "deezer" | "itunes";
  label: string;
};

type CacheEntry = { value: PreviewMatch | null; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const TTL_HIT = 60 * 60 * 1000;
const TTL_MISS = 10 * 60 * 1000;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\((feat|with|ao vivo|live|remix)[^)]*\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type DeezerResult = {
  title?: string;
  preview?: string;
  artist?: { name?: string };
};

function sameTrack(wantedTrack: string, wantedArtist: string, foundTrack = "", foundArtist = "") {
  const track = normalize(foundTrack);
  const artist = normalize(foundArtist);
  const tituloBate = track.includes(wantedTrack) || wantedTrack.includes(track);
  const artistaBate = artist.includes(wantedArtist) || wantedArtist.includes(artist);
  return Boolean(track) && Boolean(artist) && tituloBate && artistaBate;
}

// A busca publica do Deezer devolve previa de 30s em mp3 sem chave nenhuma.
async function findOnDeezer(track: SpotifyTrack): Promise<PreviewMatch | null> {
  const artist = track.artists[0]?.name || "";
  const query = `artist:"${artist}" track:"${track.name}"`;

  const response = await fetch(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`,
    { signal: AbortSignal.timeout(5000), cache: "no-store" },
  );

  if (!response.ok) return null;
  if (!response.headers.get("content-type")?.includes("json")) return null;

  const data = (await response.json()) as { data?: DeezerResult[] };
  const wantedTrack = normalize(track.name);
  const wantedArtist = normalize(artist);

  for (const result of data.data || []) {
    if (!result.preview) continue;
    if (sameTrack(wantedTrack, wantedArtist, result.title, result.artist?.name)) {
      return {
        url: result.preview,
        source: "deezer",
        label: `prévia de 30s via Deezer (${result.artist?.name} — ${result.title})`,
      };
    }
  }

  return null;
}

type ItunesResult = {
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
};

// A Spotify parou de preencher preview_url para credenciais criadas depois de
// nov/2024, entao sem outra fonte nao existe audio para analisar. A busca
// publica da Apple devolve previas de 30s sem chave; casamos por artista +
// titulo e so aceitamos quando os dois batem.
async function findOnItunes(track: SpotifyTrack): Promise<PreviewMatch | null> {
  const artist = track.artists[0]?.name || "";
  const term = `${artist} ${track.name}`.trim();

  const params = new URLSearchParams({
    term,
    entity: "song",
    limit: "5",
    country: process.env.SPOTIFY_MARKET || "BR",
  });

  const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`, {
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });

  if (!response.ok) return null;
  if (!response.headers.get("content-type")?.includes("json")) return null;

  const data = (await response.json()) as { results?: ItunesResult[] };
  const wantedTrack = normalize(track.name);
  const wantedArtist = normalize(artist);

  for (const result of data.results || []) {
    if (!result.previewUrl) continue;

    if (sameTrack(wantedTrack, wantedArtist, result.trackName, result.artistName)) {
      return {
        url: result.previewUrl,
        source: "itunes",
        label: `prévia de 30s via Apple Music (${result.artistName} — ${result.trackName})`,
      };
    }
  }

  return null;
}

export async function resolvePreview(track: SpotifyTrack): Promise<PreviewMatch | null> {
  const cached = cache.get(track.id);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  let match: PreviewMatch | null = null;

  if (track.preview_url) {
    match = { url: track.preview_url, source: "spotify", label: "prévia de 30s da API do Spotify" };
  } else {
    // ordem por confiabilidade observada; qualquer fonte fora do ar so faz cair
    // para a proxima
    for (const buscar of [findOnDeezer, findOnItunes]) {
      try {
        match = await buscar(track);
      } catch {
        match = null;
      }
      if (match) break;
    }
  }

  cache.set(track.id, {
    value: match,
    expiresAt: Date.now() + (match ? TTL_HIT : TTL_MISS),
  });

  return match;
}
