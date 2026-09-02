import { NextResponse } from "next/server";
import { GENRES } from "@/lib/genres";

export async function GET() {
  return NextResponse.json({ genres: GENRES });
}
