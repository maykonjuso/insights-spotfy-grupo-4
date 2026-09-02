import { NextRequest, NextResponse } from "next/server";
import { resolvePreview } from "@/lib/preview-source";
import {
  SpotifyConfigError,
  spotifyFetch,
  spotifyMarket,
  type SpotifyTrack,
} from "@/lib/spotify";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Proxy do preview de 30s: o navegador nao consegue baixar o mp3 do CDN do
// Spotify por causa de CORS, entao o servidor busca e devolve na mesma origem
// para o front decodificar e analisar.
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const track = await spotifyFetch<SpotifyTrack>(`/tracks/${id}?market=${spotifyMarket()}`);
    const match = await resolvePreview(track);

    if (!match) {
      return NextResponse.json(
        {
          error:
            "Não há prévia de áudio disponível para esta faixa. Envie o arquivo pelo painel de upload para escaneá-la.",
        },
        { status: 404 },
      );
    }

    const audio = await fetch(match.url, { cache: "no-store" });

    if (!audio.ok || !audio.body) {
      return NextResponse.json({ error: "Não consegui baixar a prévia da faixa." }, { status: 502 });
    }

    return new NextResponse(audio.body, {
      headers: {
        "Content-Type": audio.headers.get("content-type") || "audio/mpeg",
        "Cache-Control": "private, max-age=300",
        "X-Preview-Source": match.source,
      },
    });
  } catch (error) {
    if (error instanceof SpotifyConfigError) {
      return NextResponse.json(
        { error: "Configure SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET em .env.local." },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: "Não consegui carregar o áudio desta faixa." }, { status: 502 });
  }
}
