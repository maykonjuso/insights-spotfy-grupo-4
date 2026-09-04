import { NextRequest } from "next/server";
import type { Mensagem } from "@/lib/transmissao/tipos";
import { gravar, ler, SEM_MARCAS, temUpstash, type Marcas } from "@/lib/transmissao/servidor";

// Canal do modo apresentação. Quem publica faz POST; quem assiste abre um
// EventSource. O que muda entre um jeito e outro é só onde o estado mora:
// memória do processo quando há um servidor só, Redis quando o app está na
// Vercel e cada requisição pode cair em outra instância.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Sem isto, o plano Hobby corta a função em 10s e a conexão se refaz o tempo
// todo. Com 60s ela ainda se refaz, mas de minuto em minuto, e o EventSource
// reconecta sozinho sem a página perceber.
export const maxDuration = 60;

// Ritmo da consulta ao Redis, em milissegundos.
//
// Ler quatro vezes por segundo o tempo todo era o grosso do custo: 88% dos
// comandos, e uma pessoa que só abriu o app para testar uma música gastava 14
// mil por hora sem nenhuma apresentação acontecendo.
//
// Agora o intervalo se ajusta: rápido enquanto há transmissão e coisa mudando,
// lento quando não há ninguém no ar, com recuo gradual quando o apresentador
// está parado falando.
const RAPIDO = 250;
const MORNO = 700;
const LENTO = 2500;
/** leituras seguidas sem novidade antes de começar a desacelerar */
const PACIENCIA = 8;

type Inscrito = (dado: string) => void;
const salas = new Map<string, Set<Inscrito>>();

function inscritosDe(sala: string) {
  let conjunto = salas.get(sala);
  if (!conjunto) {
    conjunto = new Set();
    salas.set(sala, conjunto);
  }
  return conjunto;
}

export async function GET(request: NextRequest) {
  const sala = request.nextUrl.searchParams.get("sala") ?? "geral";

  // /api/transmissao?info=1 diz qual motor está no ar, para o painel do admin
  if (request.nextUrl.searchParams.get("info")) {
    return Response.json({ motor: temUpstash() ? "upstash" : "memoria" });
  }

  const codificador = new TextEncoder();
  const comRedis = temUpstash();

  const stream = new ReadableStream({
    async start(controller) {
      let vivo = true;

      const escrever = (texto: string) => {
        if (!vivo) return;
        try {
          controller.enqueue(codificador.encode(texto));
        } catch {
          vivo = false;
        }
      };

      const enviar: Inscrito = (dado) => escrever(`data: ${dado}\n\n`);

      // comentário inicial: abre o fluxo e evita que proxies segurem a resposta
      escrever(": ok\n\n");

      if (!comRedis) inscritosDe(sala).add(enviar);

      // Com Redis o servidor é quem consulta, e não o navegador: uma conexão
      // por espectador, em vez de cada aparelho batendo no Redis por conta.
      let marcas: Marcas = SEM_MARCAS;
      let parado = 0;
      let proximaLeitura: ReturnType<typeof setTimeout> | null = null;

      async function consultar() {
        if (!vivo) return;

        const { mensagens, marcas: novas, ativo } = await ler(sala, marcas);
        marcas = novas;

        for (const mensagem of mensagens) enviar(JSON.stringify(mensagem));

        parado = mensagens.length > 0 ? 0 : parado + 1;

        // sem transmissão no ar, olhar de dois em dois segundos e meio basta
        const espera = !ativo ? LENTO : parado > PACIENCIA ? MORNO : RAPIDO;

        if (vivo) proximaLeitura = setTimeout(consultar, espera);
      }

      if (comRedis) void consultar();

      const pulso = setInterval(() => escrever(": ping\n\n"), 20_000);

      request.signal.addEventListener("abort", () => {
        vivo = false;
        clearInterval(pulso);
        if (proximaLeitura) clearTimeout(proximaLeitura);
        if (!comRedis) {
          const conjunto = inscritosDe(sala);
          conjunto.delete(enviar);
          if (conjunto.size === 0) salas.delete(sala);
        }
        try {
          controller.close();
        } catch {
          // já fechado pelo próprio cliente
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: NextRequest) {
  const sala = request.nextUrl.searchParams.get("sala") ?? "geral";
  const corpo = await request.text();

  if (temUpstash()) {
    try {
      await gravar(sala, JSON.parse(corpo) as Mensagem);
      return Response.json({ ok: true, motor: "upstash" });
    } catch {
      return Response.json({ ok: false, erro: "mensagem inválida" }, { status: 400 });
    }
  }

  for (const enviar of inscritosDe(sala)) enviar(corpo);
  return Response.json({ ok: true, motor: "memoria", inscritos: inscritosDe(sala).size });
}
