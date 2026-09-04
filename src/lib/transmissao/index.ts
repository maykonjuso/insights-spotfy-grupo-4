"use client";

import { canalLocal } from "./local";
import { canalSse } from "./sse";
import type { Canal, Motor } from "./tipos";

// A checagem lê variável de ambiente, não precisa do cliente do Supabase junto.
export function temSupabase() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export * from "./tipos";

export const SALA = "popularity-lab";

/**
 * Escolhe o canal disponível, do mais capaz para o mais simples:
 *
 * 1. Supabase, quando as chaves existem. É o único que funciona entre
 *    aparelhos diferentes com o app hospedado na Vercel.
 * 2. SSE pelo próprio Next, quando não há chaves. Funciona entre aparelhos
 *    desde que exista uma instância só do servidor (rodando na sua máquina,
 *    ou num VPS).
 * 3. BroadcastChannel, se nem EventSource existir. Só entre abas do mesmo
 *    navegador, o suficiente para conferir se tudo funciona.
 */
export function motorAtual(): Motor {
  if (temSupabase()) return "supabase";
  if (typeof EventSource !== "undefined") return "sse";
  return "local";
}

/**
 * Import dinâmico do driver do Supabase de propósito: são cerca de 67 kB de
 * JavaScript que quase ninguém usa. Ficando estático, todo visitante que só
 * quer testar uma música baixaria o cliente inteiro de um serviço de tempo
 * real. Assim ele só chega em quem realmente vai transmitir ou acompanhar.
 */
export async function abrirCanal(sala = SALA): Promise<Canal> {
  const motor = motorAtual();

  if (motor === "supabase") {
    const { canalSupabase } = await import("./supabase");
    return canalSupabase(sala);
  }

  if (motor === "sse") return canalSse(sala);
  return canalLocal(sala);
}

/**
 * Qual armazenamento o servidor está usando por trás do SSE. O navegador não
 * enxerga variável de ambiente do servidor, então ele pergunta.
 */
export async function motorDoServidor(): Promise<"upstash" | "memoria"> {
  try {
    const r = await fetch("/api/transmissao?info=1");
    const d = (await r.json()) as { motor?: "upstash" | "memoria" };
    return d.motor ?? "memoria";
  } catch {
    return "memoria";
  }
}

/** Com Redis o servidor lê a cada 250ms, então mandar cursor mais rápido que
 *  isso só gasta comando e não deixa o ponteiro mais suave. */
export function intervaloDoCursor(motor: Motor, servidor: "upstash" | "memoria") {
  if (motor === "supabase") return 50;
  return servidor === "upstash" ? 200 : 50;
}

export function descricaoDoMotor(motor: Motor, servidor: "upstash" | "memoria" = "memoria") {
  if (motor === "supabase") {
    return "Supabase Realtime. Funciona entre aparelhos, com o app hospedado na Vercel.";
  }
  if (motor === "sse" && servidor === "upstash") {
    return "Upstash Redis pelo servidor. Funciona entre aparelhos, com o app hospedado na Vercel.";
  }
  if (motor === "sse") {
    return "Servidor deste computador. Funciona entre aparelhos na mesma rede, com um servidor só. Na Vercel não vale: lá cada requisição pode cair em outra instância.";
  }
  return "Só entre abas deste navegador. Serve para conferir, não para apresentar.";
}
