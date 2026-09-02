import { NextResponse } from 'next/server';
import { genero_cats } from '@/lib/artifacts';

export async function GET() {
  return NextResponse.json({ generos: genero_cats, count: genero_cats.length });
}