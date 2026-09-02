import { NextRequest, NextResponse } from "next/server";
import {
  SpotifyConfigError,
  spotifyFetch,
  spotifyMarket,
  trySpotifyFetch,
  type AudioFeatures,
  type SpotifyTrack,
} from "@/lib/spotify";
import { buildTrackInsight } from "@/lib/insights";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const track = await spotifyFetch<SpotifyTrack>(`/tracks/${id}?market=${spotifyMarket()}`);
    const features = await trySpotifyFetch<AudioFeatures>(`/audio-features/${id}`);
    const insight = buildTrackInsight(track, features);

    return NextResponse.json({ track, features, insight });
  } catch (error) {
    if (error instanceof SpotifyConfigError) {
      return NextResponse.json(
        { error: "Configure SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET em .env.local." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "Não foi possível carregar a análise da faixa." },
      { status: 502 },
    );
  }
}
