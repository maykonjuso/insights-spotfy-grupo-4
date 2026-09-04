"use client";

import type { Canal, Mensagem } from "./tipos";

// Canal pelo próprio servidor Next: quem transmite faz POST, quem assiste abre
// um EventSource. Funciona sem conta em lugar nenhum, desde que exista uma
// instância só do servidor (rodando na sua máquina, ou num VPS). Na Vercel,
// onde cada requisição pode cair numa instância diferente, isso não vale.
export function canalSse(sala: string): Canal {
  const ouvintes = new Set<(m: Mensagem) => void>();
  let fonte: EventSource | null = null;

  if (typeof EventSource !== "undefined") {
    fonte = new EventSource(`/api/transmissao?sala=${encodeURIComponent(sala)}`);
    fonte.addEventListener("message", (evento) => {
      try {
        const mensagem = JSON.parse(evento.data) as Mensagem;
        ouvintes.forEach((ouvinte) => ouvinte(mensagem));
      } catch {
        // mensagem malformada não pode derrubar a sessão de quem assiste
      }
    });
  }

  return {
    nome: "sse",
    enviar: (mensagem) => {
      void fetch(`/api/transmissao?sala=${encodeURIComponent(sala)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mensagem),
        keepalive: true,
      }).catch(() => {});
    },
    aoReceber: (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    fechar: () => fonte?.close(),
  };
}
