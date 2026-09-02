import type { SpotifyTrack } from "./spotify";

export type PreviewMatch = {
  url: string;
  source: "spotify" | "deezer" | "itunes";
  label: string;
};

// Distingue "procurei e nao achou" de "a busca falhou": o primeiro vale cache,
// o segundo nao. Cachear falha de rede como ausencia era o que fazia o botao de
// scan sumir por 10 minutos depois de um unico timeout.
type Lookup = { match: PreviewMatch | null; failed: boolean };

type CacheEntry = { value: PreviewMatch | null; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const TTL_HIT = 60 * 60 * 1000;
const TTL_SEM_MATCH = 10 * 60 * 1000;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "Enter Sandman - Remastered 2021", "Bamboo Girl (Radio Edit)" e
// "Song (feat. X)" precisam casar com o titulo cru dos outros catalogos.
function baseTitle(value: string) {
  return value
    .replace(/\s[-–—]\s.*$/, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ");
}

function tokens(value: string) {
  return new Set(normalize(value).split(" ").filter((token) => token.length > 1));
}

function overlap(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let comuns = 0;
  a.forEach((token) => {
    if (b.has(token)) comuns += 1;
  });
  return comuns / Math.min(a.size, b.size);
}

function combina(alvo: string, candidato: string, minimo: number) {
  const a = normalize(alvo);
  const b = normalize(candidato);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  return overlap(tokens(alvo), tokens(candidato)) >= minimo;
}

function aceita(track: SpotifyTrack, titulo?: string, artista?: string) {
  if (!titulo || !artista) return false;

  const tituloBate =
    combina(track.name, titulo, 0.7) || combina(baseTitle(track.name), baseTitle(titulo), 0.7);

  // o Spotify credita varios artistas; qualquer um deles serve para casar
  const artistaBate = track.artists.some((credito) => combina(credito.name, artista, 0.5));

  return tituloBate && artistaBate;
}

async function buscarJson(url: string, tentativas = 2): Promise<unknown | null> {
  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(tentativa * 6000),
        cache: "no-store",
      });

      if (!response.ok) return null;
      if (!response.headers.get("content-type")?.includes("json")) return null;

      return await response.json();
    } catch {
      if (tentativa === tentativas) throw new Error("busca de prévia indisponível");
    }
  }

  return null;
}

type DeezerResult = { title?: string; preview?: string; artist?: { name?: string } };

// A busca publica do Deezer devolve previa de 30s em mp3 sem chave nenhuma.
async function findOnDeezer(track: SpotifyTrack): Promise<Lookup> {
  const artist = track.artists[0]?.name || "";

  // a consulta estruturada e mais precisa, mas falha com titulos que trazem
  // sufixos; o termo solto entra como segunda tentativa
  const consultas = [
    `artist:"${artist}" track:"${baseTitle(track.name).trim()}"`,
    `${artist} ${baseTitle(track.name)}`.trim(),
  ];

  for (const consulta of consultas) {
    const data = (await buscarJson(
      `https://api.deezer.com/search?q=${encodeURIComponent(consulta)}&limit=10`,
    )) as { data?: DeezerResult[] } | null;

    if (!data) continue;

    for (const result of data.data || []) {
      if (!result.preview) continue;
      if (aceita(track, result.title, result.artist?.name)) {
        return {
          match: {
            url: result.preview,
            source: "deezer",
            label: `prévia de 30s via Deezer (${result.artist?.name} — ${result.title})`,
          },
          failed: false,
        };
      }
    }
  }

  return { match: null, failed: false };
}

type ItunesResult = { trackName?: string; artistName?: string; previewUrl?: string };

async function findOnItunes(track: SpotifyTrack): Promise<Lookup> {
  const artist = track.artists[0]?.name || "";
  const params = new URLSearchParams({
    term: `${artist} ${baseTitle(track.name)}`.trim(),
    entity: "song",
    limit: "10",
    country: process.env.SPOTIFY_MARKET || "BR",
  });

  const data = (await buscarJson(`https://itunes.apple.com/search?${params.toString()}`)) as {
    results?: ItunesResult[];
  } | null;

  if (!data) return { match: null, failed: false };

  for (const result of data.results || []) {
    if (!result.previewUrl) continue;
    if (aceita(track, result.trackName, result.artistName)) {
      return {
        match: {
          url: result.previewUrl,
          source: "itunes",
          label: `prévia de 30s via Apple Music (${result.artistName} — ${result.trackName})`,
        },
        failed: false,
      };
    }
  }

  return { match: null, failed: false };
}

export async function resolvePreview(track: SpotifyTrack): Promise<PreviewMatch | null> {
  const cached = cache.get(track.id);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  if (track.preview_url) {
    const match: PreviewMatch = {
      url: track.preview_url,
      source: "spotify",
      label: "prévia de 30s da API do Spotify",
    };
    cache.set(track.id, { value: match, expiresAt: Date.now() + TTL_HIT });
    return match;
  }

  let algumaFalhou = false;

  for (const buscar of [findOnDeezer, findOnItunes]) {
    try {
      const { match } = await buscar(track);
      if (match) {
        cache.set(track.id, { value: match, expiresAt: Date.now() + TTL_HIT });
        return match;
      }
    } catch {
      algumaFalhou = true;
    }
  }

  if (algumaFalhou) {
    // sem cache: a proxima tentativa do usuario pode dar certo
    console.warn(`[preview] busca falhou para "${track.name}" (${track.id}); nada cacheado`);
    return null;
  }

  cache.set(track.id, { value: null, expiresAt: Date.now() + TTL_SEM_MATCH });
  return null;
}
