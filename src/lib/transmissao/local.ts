"use client";

import type { Canal, Mensagem } from "./tipos";

// Só entre abas do mesmo navegador. Serve para desenvolver e para conferir o
// modo apresentação sem depender de conta em serviço nenhum.
export function canalLocal(sala: string): Canal {
  const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`lab-${sala}`) : null;
  const ouvintes = new Set<(m: Mensagem) => void>();

  bc?.addEventListener("message", (evento) => {
    ouvintes.forEach((ouvinte) => ouvinte(evento.data as Mensagem));
  });

  return {
    nome: "local",
    enviar: (mensagem) => bc?.postMessage(mensagem),
    aoReceber: (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    fechar: () => bc?.close(),
  };
}
