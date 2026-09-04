import "server-only";
import { Redis } from "@upstash/redis";
import type { Mensagem } from "./tipos";

/**
 * Onde o estado da transmissão vive no servidor.
 *
 * Em memória basta quando existe uma instância só (sua máquina, um VPS). Na
 * Vercel não: cada requisição pode cair num processo diferente, e quem publica
 * nunca encontraria quem escuta. Por isso, havendo Upstash configurado, o
 * estado passa a morar no Redis e a rota SSE vira um leitor dele.
 *
 * O desenho aqui é todo em função da conta de comandos do Upstash:
 *
 * - três chaves separadas, uma por tipo de dado, para escrever ser um SET só.
 *   Guardar tudo num JSON exigia ler antes de gravar, e dobrava o custo.
 * - leitura é um MGET das três, que conta como um comando só.
 * - versão é o próprio instante da gravação, então ninguém precisa manter
 *   contador em lugar nenhum.
 */

export type Marcas = { estado: number; cursor: number; clique: number; fim: number };

export const SEM_MARCAS: Marcas = { estado: 0, cursor: 0, clique: 0, fim: 0 };

type Estado = (Mensagem & { tipo: "estado" }) | null;
type Ponto = { x: number; y: number; t: number } | null;
type Fim = { id: string; t: number } | null;

/**
 * Estado mais velho que isto significa que o apresentador sumiu: o batimento
 * republica de tres em tres segundos, entao nada fresco nao existe enquanto
 * alguem esta no ar de verdade.
 *
 * Vale como corte de entrega, e nao so como ritmo de leitura. As chaves duram
 * duas horas, e quem abria o app nesse intervalo recebia o ultimo estado
 * gravado e era convidado a acompanhar uma apresentacao encerrada havia muito
 * tempo.
 */
const FRESCOR = 15_000;

// duas horas: uma apresentação acaba muito antes, e as chaves se limpam sozinhas
const VALIDADE = 60 * 60 * 2;

let redis: Redis | null = null;

export function temUpstash() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function cliente() {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

function chaves(sala: string) {
  const base = `lab:transmissao:${sala}`;
  return {
    estado: `${base}:estado`,
    cursor: `${base}:cursor`,
    clique: `${base}:clique`,
    fim: `${base}:fim`,
  };
}

export type Leitura = {
  mensagens: Mensagem[];
  marcas: Marcas;
  /** houve transmissão ativa nos últimos segundos */
  ativo: boolean;
};

/** Um MGET das três chaves: um comando, não três. */
export async function ler(sala: string, desde: Marcas): Promise<Leitura> {
  const k = chaves(sala);

  let estado: Estado = null;
  let cursor: Ponto = null;
  let clique: Ponto = null;
  let fim: Fim = null;

  try {
    // quatro chaves num MGET continua sendo um comando so
    [estado, cursor, clique, fim] = await cliente().mget<[Estado, Ponto, Ponto, Fim]>(
      k.estado,
      k.cursor,
      k.clique,
      k.fim,
    );
  } catch {
    // Redis fora do ar não derruba a página de quem assiste; ela só para de
    // receber atualizações até voltar
    return { mensagens: [], marcas: desde, ativo: false };
  }

  const mensagens: Mensagem[] = [];
  const marcas: Marcas = { ...desde };

  // O fim vai primeiro: quem recebe os dois na mesma leitura precisa cair fora
  // do ar, e nao voltar por causa de um estado que ficou para tras.
  if (fim && fim.t > desde.fim) {
    mensagens.push({ tipo: "fim", apresentadorId: fim.id, em: fim.t });
    marcas.fim = fim.t;
  }

  const fresco = Boolean(estado && Date.now() - estado.estado.em < FRESCOR);

  if (estado && fresco && estado.estado.em > desde.estado) {
    mensagens.push(estado);
    marcas.estado = estado.estado.em;
  }

  if (cursor && cursor.t > desde.cursor) {
    mensagens.push({ tipo: "cursor", x: cursor.x, y: cursor.y });
    marcas.cursor = cursor.t;
  }

  if (clique && clique.t > desde.clique) {
    mensagens.push({ tipo: "clique", x: clique.x, y: clique.y });
    marcas.clique = clique.t;
  }

  // "ativo" é o que decide o ritmo da próxima leitura: sem transmissão no ar,
  // não faz sentido consultar quatro vezes por segundo
  const ativo = fresco;

  return { mensagens, marcas, ativo };
}

/** Uma escrita, um SET. Sem ler antes. */
export async function gravar(sala: string, mensagem: Mensagem) {
  const k = chaves(sala);
  const agora = Date.now();

  if (mensagem.tipo === "estado") {
    await cliente().set(k.estado, mensagem, { ex: VALIDADE });
    return;
  }

  if (mensagem.tipo === "cursor") {
    await cliente().set(k.cursor, { x: mensagem.x, y: mensagem.y, t: agora }, { ex: VALIDADE });
    return;
  }

  if (mensagem.tipo === "clique") {
    await cliente().set(k.clique, { x: mensagem.x, y: mensagem.y, t: agora }, { ex: VALIDADE });
    return;
  }

  if (mensagem.tipo === "fim") {
    // A marca fica: sem ela o encerramento se perde para quem apresenta de
    // outra maquina. Ele nao le nada, so publica, e em tres segundos o
    // batimento dele recriava a chave de estado que acabou de ser apagada.
    await cliente().del(k.estado, k.cursor, k.clique);
    // `mensagem.em` e nao `agora`: quem compara essa marca e o navegador que
    // apresenta, contra o instante em que ele entrou no ar. Os dois lados
    // sendo relogio de navegador, a comparacao nao depende do relogio do
    // servidor bater com o deles -- mesma premissa que `estado.em` ja usa.
    await cliente().set(k.fim, { id: mensagem.apresentadorId, t: mensagem.em }, { ex: VALIDADE });
  }
}
