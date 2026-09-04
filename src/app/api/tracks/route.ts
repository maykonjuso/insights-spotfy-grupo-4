import { NextRequest, NextResponse } from "next/server";
import { resolvePreview } from "@/lib/preview-source";
import {
  SpotifyApiError,
  SpotifyConfigError,
  spotifyFetch,
  spotifyMarket,
  type SpotifyTrack,
} from "@/lib/spotify";

type SearchResponse = {
  tracks: {
    items: SpotifyTrack[];
  };
};

const ALVO = 10;
const LOTE = 6;

// A busca traz mais faixas do que a tela mostra porque so entram as que tem
// previa: sem audio nao ha analise musical, e uma linha que nao toca nem
// escaneia so frustra quem clica.
async function comAudio(candidatos: SpotifyTrack[]) {
  const escolhidos: (SpotifyTrack & { preview: { source: string; label: string } })[] = [];

  for (let inicio = 0; inicio < candidatos.length && escolhidos.length < ALVO; inicio += LOTE) {
    const lote = candidatos.slice(inicio, inicio + LOTE);
    const resolvidos = await Promise.all(
      lote.map(async (track) => ({ track, match: await resolvePreview(track).catch(() => null) })),
    );

    for (const { track, match } of resolvidos) {
      if (match && escolhidos.length < ALVO) {
        escolhidos.push({ ...track, preview: { source: match.source, label: match.label } });
      }
    }
  }

  return escolhidos;
}

export async function GET(request: NextRequest) {
  const genre = request.nextUrl.searchParams.get("genre")?.trim();
  const termo = request.nextUrl.searchParams.get("q")?.trim();

  if (!genre && !termo) {
    return NextResponse.json({ error: "Informe um estilo ou um nome de música." }, { status: 400 });
  }

  // Duas formas de buscar no mesmo endpoint: por estilo (`genre:"pop"`, usado
  // pelos atalhos) ou por texto livre (nome da musica ou do artista). O filtro
  // genre: do Spotify so aceita generos do catalogo dele, entao digitar o nome
  // de uma musica ali nunca devolvia nada -- era o que fazia a barra parecer
  // quebrada.
  const consulta = termo ? termo : `genre:"${genre}"`;

  // a busca aceita no maximo limit=10 nesta credencial; o offset e o que
  // permite juntar candidatos suficientes para sobrar 10 faixas com audio
  function paginaUrl(offset: number) {
    const params = new URLSearchParams({
      q: consulta,
      type: "track",
      limit: "10",
      offset: String(offset),
      market: spotifyMarket(),
    });
    return `/search?${params.toString()}`;
  }

  try {
    const paginas = await Promise.allSettled(
      [0, 10, 20].map((offset) => spotifyFetch<SearchResponse>(paginaUrl(offset))),
    );

    const itens = paginas
      .filter((pagina): pagina is PromiseFulfilledResult<SearchResponse> => pagina.status === "fulfilled")
      .flatMap((pagina) => pagina.value.tracks.items);

    if (itens.length === 0) {
      const primeira = paginas.find((pagina) => pagina.status === "rejected");
      throw primeira && primeira.status === "rejected" ? primeira.reason : new Error("busca vazia");
    }

    // Na busca por texto o Spotify devolve a mesma musica em varios albuns
    // (single, coletanea, ao vivo). Agrupar por nome + artista evita uma lista
    // com quatro linhas iguais.
    const seen = new Set<string>();
    const candidatos = itens.filter((track) => {
      const chave = termo
        ? `${track.name.toLowerCase()}|${track.artists[0]?.name.toLowerCase() ?? ""}`
        : track.id;
      if (seen.has(chave)) return false;
      seen.add(chave);
      return true;
    });

    const tracks = await comAudio(candidatos);

    return NextResponse.json({
      genre: genre ?? null,
      q: termo ?? null,
      tracks,
      analisadas: candidatos.length,
    });
  } catch (error) {
    if (error instanceof SpotifyConfigError) {
      return NextResponse.json(
        { error: "Configure SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET em .env.local." },
        { status: 500 },
      );
    }

    if (error instanceof SpotifyApiError) {
      return NextResponse.json(
        {
          error: "Não foi possível buscar faixas no Spotify agora.",
          status: error.status,
          details:
            process.env.NODE_ENV === "development"
              ? error.details?.slice(0, 300)
              : undefined,
        },
        { status: 502 },
      );
    }

    console.error("[tracks] falha inesperada:", error);
    return NextResponse.json(
      { error: "Não foi possível buscar faixas no Spotify agora." },
      { status: 502 },
    );
  }
}
