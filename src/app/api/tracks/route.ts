import { NextRequest, NextResponse } from "next/server";
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

export async function GET(request: NextRequest) {
  const genre = request.nextUrl.searchParams.get("genre")?.trim();

  if (!genre) {
    return NextResponse.json({ error: "Informe um gênero musical." }, { status: 400 });
  }

  const params = new URLSearchParams({
    q: `genre:"${genre}"`,
    type: "track",
    limit: "10",
    market: spotifyMarket(),
  });

  try {
    const data = await spotifyFetch<SearchResponse>(`/search?${params.toString()}`);
    const seen = new Set<string>();
    const tracks = data.tracks.items
      .filter((track) => {
        if (seen.has(track.id)) return false;
        seen.add(track.id);
        return true;
      })
      .sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1))
      .slice(0, 10);

    return NextResponse.json({ genre, tracks });
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

    return NextResponse.json(
      { error: "Não foi possível buscar faixas no Spotify agora." },
      { status: 502 },
    );
  }
}
