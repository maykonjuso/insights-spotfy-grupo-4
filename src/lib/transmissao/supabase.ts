"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { Canal, Mensagem } from "./tipos";

// Broadcast puro do Supabase Realtime: não cria tabela, não escreve no banco,
// não usa autenticação. É só um canal de mensagens efêmeras, que é exatamente
// o que uma apresentação ao vivo precisa.
export function canalSupabase(sala: string): Canal {
  const cliente = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { realtime: { params: { eventsPerSecond: 30 } } },
  );

  const ouvintes = new Set<(m: Mensagem) => void>();
  let pronto = false;
  const fila: Mensagem[] = [];

  const canal: RealtimeChannel = cliente
    .channel(`lab-${sala}`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "msg" }, ({ payload }) => {
      ouvintes.forEach((ouvinte) => ouvinte(payload as Mensagem));
    })
    .subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      pronto = true;
      // o que foi enviado antes da inscrição terminar não pode se perder: o
      // primeiro "estado" é justamente o que dispara o convite de quem assiste
      while (fila.length) {
        const proxima = fila.shift();
        if (proxima) void canal.send({ type: "broadcast", event: "msg", payload: proxima });
      }
    });

  return {
    nome: "supabase",
    enviar: (mensagem) => {
      if (!pronto) {
        fila.push(mensagem);
        return;
      }
      void canal.send({ type: "broadcast", event: "msg", payload: mensagem });
    },
    aoReceber: (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    fechar: () => {
      void cliente.removeChannel(canal);
    },
  };
}
