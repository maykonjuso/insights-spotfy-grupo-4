// Contrato do modo apresentação, separado de qualquer serviço.
//
// A escolha do canal (Supabase, SSE do próprio Next, ou BroadcastChannel local)
// é um detalhe de infraestrutura. Isolar assim significa que trocar de serviço
// mexe em um arquivo só, e que dá para desenvolver e testar sem conta nenhuma.

export type Apresentador = {
  id: string;
  nome: string;
  /** foto em data URL, já reduzida no cliente antes de ser transmitida */
  foto?: string;
};

/** Onde o apresentador está e o que ele está olhando. */
export type Estado = {
  apresentador: Apresentador;
  /** rota do Next: "/" ou "/projeto" */
  rota: string;
  /** tela do app quando a rota é "/" */
  tela?: string;
  /** seção da landing quando a rota é "/projeto" */
  secao?: string;
  /** rolagem em fração de 0 a 1, para funcionar entre telas de tamanhos diferentes */
  rolagem: number;
  /**
   * Estado da interface de quem apresenta: acordeões abertos, estilo escolhido,
   * posição dos sliders. Vai inteiro em toda publicação, e não como evento
   * separado, por dois motivos: quem entra no meio da apresentação recebe a
   * tela já do jeito certo, e uma mensagem perdida se conserta sozinha na
   * repetição seguinte.
   */
  ui?: Record<string, unknown>;
  em: number;
};

/**
 * Encerramento dirigido a qualquer apresentação, e não a uma em particular.
 *
 * Quem está no /admin de outra máquina não sabe o id de quem está no ar, e é
 * justamente esse o caso em que encerrar importa: a apresentação ficou aberta
 * num computador ao qual ninguém tem acesso agora.
 */
export const TODOS = "*";

export type Mensagem =
  | { tipo: "estado"; estado: Estado }
  | { tipo: "cursor"; x: number; y: number }
  | { tipo: "clique"; x: number; y: number }
  /**
   * `em` é o que separa um encerramento de verdade de um eco antigo: a marca
   * de fim fica guardada no servidor, então quem começa a apresentar depois
   * dela a recebe ao conectar. Comparando com o instante em que a apresentação
   * começou, uma marca velha é ignorada em vez de derrubar quem acabou de
   * entrar no ar.
   */
  | { tipo: "fim"; apresentadorId: string; em: number };

export type Canal = {
  nome: string;
  enviar: (mensagem: Mensagem) => void;
  aoReceber: (ouvinte: (mensagem: Mensagem) => void) => () => void;
  fechar: () => void;
};

export type Motor = "supabase" | "sse" | "local";
