import { NextResponse } from 'next/server';
import { getGeneroCats } from '@/lib/model/artifacts';

export async function GET() {
  const genero_cats = getGeneroCats();
  return NextResponse.json({ generos: genero_cats, count: genero_cats.length });
}