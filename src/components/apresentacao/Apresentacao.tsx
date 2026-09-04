"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bolha } from "./Bolha";
import {
  abrirCanal,
  intervaloDoCursor,
  motorAtual,
  motorDoServidor,
  type Apresentador,
  type Canal,
  type Estado,
  type Mensagem,
} from "@/lib/transmissao";

/** o que varia enquanto se apresenta; quem está apresentando o provedor já sabe */
export type Posicao = {
  rota: string;
  tela?: string;
  secao?: string;
};

/** rolagem em fração da altura rolável, medida na hora do envio */
function rolagemAtual() {
  const rolavel = document.documentElement.scrollHeight - window.innerHeight;
  return rolavel > 0 ? window.scrollY / rolavel : 0;
}

type Contexto = {
  /** estado recebido de quem está transmitindo, quando estou acompanhando */
  seguindo: Estado | null;
  /** publica onde estou, quando sou eu quem transmite */
  transmitir: (posicao: Posicao) => void;
  iniciar: (apresentador: Apresentador) => void;
  encerrar: () => void;
  transmitindo: boolean;
  apresentador: Apresentador | null;
  /** estado de interface recebido de quem apresenta */
  espelho: Record<string, unknown>;
  /** publica uma peça do estado de interface */
  publicarUi: (chave: string, valor: unknown) => void;
};

const ApresentacaoContexto = createContext<Contexto | null>(null);

export function useApresentacao() {
  const contexto = useContext(ApresentacaoContexto);
  if (!contexto) throw new Error("useApresentacao fora do provedor");
  return contexto;
}

/**
 * Estado que se espelha sozinho na tela de quem acompanha.
 *
 * Usar isto no lugar de `useState` faz o componente participar da
 * apresentação: apresentando, cada mudança é publicada; acompanhando, o valor
 * vem de quem apresenta e o toque local não muda nada, que é o comportamento
 * de "só assistir".
 */
export function useEstadoEspelhado<T>(chave: string, inicial: T): [T, (valor: T) => void] {
  const { transmitindo, seguindo, espelho, publicarUi } = useApresentacao();
  const [local, setLocal] = useState<T>(inicial);

  const recebido = espelho[chave] as T | undefined;
  const valor = seguindo && recebido !== undefined ? recebido : local;

  const definir = useCallback(
    (proximo: T) => {
      setLocal(proximo);
      if (transmitindo) publicarUi(chave, proximo);
    },
    [chave, transmitindo, publicarUi],
  );

  return [valor, definir];
}

// Quem apresenta continua sendo quem apresenta ao trocar de aba ou de rota.
// Sem isto, abrir o app numa segunda aba criava um provedor novo que se achava
// espectador, e a apresentação morria assim que o apresentador saía do /admin.
const CHAVE = "popularity-lab:apresentador";

function lerApresentador(): Apresentador | null {
  if (typeof window === "undefined") return null;
  try {
    const cru = window.localStorage.getItem(CHAVE);
    return cru ? (JSON.parse(cru) as Apresentador) : null;
  } catch {
    return null;
  }
}

/**
 * Converte um ponto da janela em fração do palco, e de volta.
 *
 * Enquanto era fração da janela, o ponteiro de quem apresentava no computador
 * caía em outro lugar na tela de quem assistia no celular: 1920px e 390px de
 * largura dão significados diferentes para "metade da tela". O palco tem a
 * mesma proporção nos dois, então a fração passa a significar a mesma coisa.
 */
function retanguloDoPalco() {
  const palco = document.querySelector(".palco");
  return palco?.getBoundingClientRect() ?? null;
}

function paraFracao(x: number, y: number) {
  const r = retanguloDoPalco();
  if (!r || r.width === 0) return null;
  // x é fração do palco, porque é aí que a largura difere entre computador e
  // celular. y é fração da janela, e não do palco: o palco tem a altura do
  // documento inteiro, e a rolagem já viaja em mensagem própria.
  return { x: (x - r.left) / r.width, y: y / window.innerHeight };
}

/** referência estável, para o contexto não mudar a cada render */
const VAZIO: Record<string, unknown> = {};

const SEGUNDOS_PARA_ACEITAR = 5;
/** um estado sem sinal por mais que isso significa que a apresentação acabou */
const SILENCIO_ATE_ENCERRAR = 20_000;

export function Apresentacao({ children }: { children: ReactNode }) {
  const canal = useRef<Canal | null>(null);
  const router = useRouter();
  const rotaAtual = usePathname();

  const [convite, setConvite] = useState<Apresentador | null>(null);
  const conviteRef = useRef(false);
  const [contagem, setContagem] = useState(SEGUNDOS_PARA_ACEITAR);
  const [seguindo, setSeguindo] = useState<Estado | null>(null);
  const [recusados, setRecusados] = useState<string[]>([]);
  const [transmitindo, setTransmitindo] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [cliques, setCliques] = useState<{ id: number; x: number; y: number }[]>([]);

  const euApresento = useRef<Apresentador | null>(null);
  const ultimoSinal = useRef(0);
  const seguindoRef = useRef(false);
  /** última posição publicada, repetida pelo batimento */
  const ultimaPosicao = useRef<Posicao | null>(null);
  /** estado de interface acumulado de quem apresenta */
  const ui = useRef<Record<string, unknown>>({});
  const [apresentador, setApresentador] = useState<Apresentador | null>(null);

  // retoma o papel de apresentador ao abrir outra aba ou trocar de rota
  useEffect(() => {
    const salvo = lerApresentador();
    if (!salvo) return;
    euApresento.current = salvo;
    setApresentador(salvo);
    setTransmitindo(true);
  }, []);

  // um canal só para a aba inteira, aberto na montagem
  const [canalPronto, setCanalPronto] = useState(0);
  const [servidor, setServidor] = useState<"upstash" | "memoria">("memoria");

  useEffect(() => {
    void motorDoServidor().then(setServidor);
  }, []);

  useEffect(() => {
    let vivo = true;

    void abrirCanal().then((aberto) => {
      if (!vivo) {
        aberto.fechar();
        return;
      }
      canal.current = aberto;
      // avisa os efeitos que dependem do canal, que montaram antes dele existir
      setCanalPronto((n) => n + 1);
    });

    return () => {
      vivo = false;
      canal.current?.fechar();
      canal.current = null;
    };
  }, []);

  const encerrar = useCallback(() => {
    const eu = euApresento.current;
    if (eu) canal.current?.enviar({ tipo: "fim", apresentadorId: eu.id });
    euApresento.current = null;
    setApresentador(null);
    setTransmitindo(false);
    try {
      window.localStorage.removeItem(CHAVE);
    } catch {
      // navegador sem storage: a apresentação só não sobrevive à troca de aba
    }
  }, []);

  const sair = useCallback(() => {
    setSeguindo((atual) => {
      if (atual) setRecusados((lista) => [...lista, atual.apresentador.id]);
      return null;
    });
    setConvite(null);
    setCursor(null);
  }, []);

  // ---- recepção
  useEffect(() => {
    const inscricao = canal.current?.aoReceber((mensagem: Mensagem) => {
      // quem transmite não reage às próprias mensagens
      if (euApresento.current) return;

      if (mensagem.tipo === "fim") {
        setSeguindo(null);
        setConvite(null);
        setCursor(null);
        return;
      }

      if (mensagem.tipo === "estado") {
        ultimoSinal.current = Date.now();
        setSeguindo((atual) => (atual ? mensagem.estado : atual));
        // Já seguindo, ou já recusei: nada de convidar de novo. Sem esta
        // checagem o convite voltava a cada estado recebido, ou seja de três em
        // três segundos, por cima de quem já estava acompanhando.
        if (seguindoRef.current || recusados.includes(mensagem.estado.apresentador.id)) return;

        if (!conviteRef.current) {
          conviteRef.current = true;
          setContagem(SEGUNDOS_PARA_ACEITAR);
          setConvite(mensagem.estado.apresentador);
        }
        return;
      }

      if (mensagem.tipo === "cursor") {
        setCursor({ x: mensagem.x, y: mensagem.y });
        return;
      }

      if (mensagem.tipo === "clique") {
        const id = Date.now() + Math.random();
        setCliques((atual) => [...atual.slice(-4), { id, x: mensagem.x, y: mensagem.y }]);
        setTimeout(() => setCliques((atual) => atual.filter((c) => c.id !== id)), 700);
      }
    });

    return inscricao;
  }, [recusados, canalPronto]);

  useEffect(() => {
    seguindoRef.current = seguindo !== null;
  }, [seguindo]);

  useEffect(() => {
    conviteRef.current = convite !== null;
  }, [convite]);

  // ---- convite com aceite automático
  useEffect(() => {
    if (!convite || seguindo) return;

    if (contagem <= 0) {
      setSeguindo({
        apresentador: convite,
        rota: rotaAtual,
        rolagem: 0,
        em: Date.now(),
      });
      setConvite(null);
      return;
    }

    const relogio = setTimeout(() => setContagem((n) => n - 1), 1000);
    return () => clearTimeout(relogio);
  }, [convite, contagem, seguindo, rotaAtual]);

  // ---- encerra sozinho se o sinal sumir
  useEffect(() => {
    if (!seguindo) return;
    const relogio = setInterval(() => {
      if (Date.now() - ultimoSinal.current > SILENCIO_ATE_ENCERRAR) {
        setSeguindo(null);
        setCursor(null);
      }
    }, 4000);
    return () => clearInterval(relogio);
  }, [seguindo]);

  // ---- espelho: rota, rolagem e trava
  const ultimaRolagem = useRef(-1);
  const ultimaSecaoVista = useRef<string | undefined>(undefined);
  const trocouSecaoEm = useRef(0);

  useEffect(() => {
    if (!seguindo) return;

    if (seguindo.rota && seguindo.rota !== rotaAtual) router.push(seguindo.rota);

    // Troca de seção: quem posiciona a página é a landing, com scrollIntoView.
    // Rolar por fração ao mesmo tempo faria as duas brigarem, e o slide nunca
    // chegava no lugar. Mas só enquanto o salto acontece: passada essa janela,
    // a rolagem volta a ser espelhada, senão descer e subir dentro de uma
    // seção não chegava do outro lado.
    if (seguindo.secao !== ultimaSecaoVista.current) {
      ultimaSecaoVista.current = seguindo.secao;
      trocouSecaoEm.current = Date.now();
      return;
    }

    if (Date.now() - trocouSecaoEm.current < 900) return;

    // o batimento repete o mesmo estado de três em três segundos; sem este
    // corte, cada repetição disparava uma rolagem suave por cima da anterior
    if (Math.abs(seguindo.rolagem - ultimaRolagem.current) < 0.01) return;
    ultimaRolagem.current = seguindo.rolagem;

    const alturaRolavel = document.documentElement.scrollHeight - window.innerHeight;
    if (alturaRolavel > 0) {
      // fração em vez de pixels: a tela de quem assiste tem outro tamanho, e
      // copiar o scrollY cru pararia no meio de outro parágrafo
      window.scrollTo({ top: seguindo.rolagem * alturaRolavel, behavior: "smooth" });
    }
  }, [seguindo, rotaAtual, router]);

  // Bloqueio de gesto, e não `overflow: hidden` no body.
  //
  // O overflow escondido propaga para a janela e a torna não rolável, e aí o
  // próprio `window.scrollTo` do espelho parava de funcionar: descer parecia
  // funcionar por acaso, subir de novo nunca voltava. Aqui o gesto é impedido
  // na origem e a rolagem programada continua livre.
  useEffect(() => {
    if (!seguindo) return;

    const impedir = (evento: Event) => evento.preventDefault();

    window.addEventListener("wheel", impedir, { passive: false });
    window.addEventListener("touchmove", impedir, { passive: false });

    return () => {
      window.removeEventListener("wheel", impedir);
      window.removeEventListener("touchmove", impedir);
    };
  }, [seguindo]);

  // ---- envio
  const transmitir = useCallback((posicao: Posicao) => {
    const eu = euApresento.current;
    if (!eu) return;
    ultimaPosicao.current = posicao;
    // A rolagem é medida aqui, e não recebida pronta. Quem chamava mandava
    // `rolagem: 0` fixo, então toda troca de tela ou de seção jogava quem
    // acompanhava de volta ao topo, e o batimento repetia isso de três em três
    // segundos por cima de qualquer rolagem em andamento.
    canal.current?.enviar({
      tipo: "estado",
      estado: {
        ...posicao,
        rolagem: rolagemAtual(),
        ui: { ...ui.current },
        apresentador: eu,
        em: Date.now(),
      },
    });
  }, []);

  const publicarUi = useCallback(
    (chave: string, valor: unknown) => {
      if (!euApresento.current) return;
      ui.current[chave] = valor;
      const posicao = ultimaPosicao.current;
      if (posicao) transmitir(posicao);
    },
    [transmitir],
  );

  // Batimento no provedor, e não na tela do /admin.
  //
  // Ele morava lá dentro, e a tela do /admin desmonta assim que o apresentador
  // vai demonstrar o app. Sem estado chegando, todo mundo que acompanhava caía
  // depois dos 20s de silêncio. Aqui ele sobrevive à navegação, porque o
  // provedor está no layout e nunca desmonta.
  useEffect(() => {
    if (!transmitindo) return;

    const pulso = setInterval(() => {
      const posicao = ultimaPosicao.current;
      if (posicao) transmitir(posicao);
    }, 3000);

    return () => clearInterval(pulso);
  }, [transmitindo, transmitir]);

  // rolagem de quem apresenta, em fração da altura rolável
  useEffect(() => {
    if (!transmitindo) return;

    let ultimo = 0;
    function aoRolar() {
      const agora = performance.now();
      if (agora - ultimo < 200) return;
      ultimo = agora;

      const posicao = ultimaPosicao.current;
      if (posicao) transmitir(posicao);
    }

    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, [transmitindo, transmitir]);

  const iniciar = useCallback((novo: Apresentador) => {
    euApresento.current = novo;
    setApresentador(novo);
    setTransmitindo(true);
    setSeguindo(null);
    setConvite(null);
    try {
      window.localStorage.setItem(CHAVE, JSON.stringify(novo));
    } catch {
      // sem storage a apresentação vale só nesta aba, e isso é aceitável
    }
  }, []);

  // ponteiro e cliques de quem transmite, em coordenadas de 0 a 1
  useEffect(() => {
    if (!transmitindo) return;

    let ultimo = 0;
    const espera = intervaloDoCursor(motorAtual(), servidor);

    function aoMover(evento: PointerEvent) {
      const agora = performance.now();
      // acima do ritmo que o canal consegue entregar, o envio extra só custa e
      // não deixa a mão mais suave
      if (agora - ultimo < espera) return;
      ultimo = agora;

      const ponto = paraFracao(evento.clientX, evento.clientY);
      if (ponto) canal.current?.enviar({ tipo: "cursor", ...ponto });
    }

    function aoClicar(evento: PointerEvent) {
      const ponto = paraFracao(evento.clientX, evento.clientY);
      if (ponto) canal.current?.enviar({ tipo: "clique", ...ponto });
    }

    window.addEventListener("pointermove", aoMover, { passive: true });
    window.addEventListener("pointerdown", aoClicar, { passive: true });
    return () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerdown", aoClicar);
    };
  }, [transmitindo, servidor]);

  const valor = useMemo<Contexto>(
    () => ({
      seguindo,
      transmitir,
      iniciar,
      encerrar,
      transmitindo,
      apresentador,
      espelho: seguindo?.ui ?? VAZIO,
      publicarUi,
    }),
    [seguindo, transmitir, iniciar, encerrar, transmitindo, apresentador, publicarUi],
  );

  return (
    <ApresentacaoContexto.Provider value={valor}>
      {children}

      {/* quem apresenta leva a bolha para qualquer página */}
      {transmitindo && apresentador ? <Bolha apresentador={apresentador} onEncerrar={encerrar} /> : null}

      {convite && !seguindo ? (
        <Convite
          apresentador={convite}
          contagem={contagem}
          onAceitar={() => {
            setSeguindo({ apresentador: convite, rota: rotaAtual, rolagem: 0, em: Date.now() });
            setConvite(null);
          }}
          onRecusar={() => {
            setRecusados((lista) => [...lista, convite.id]);
            setConvite(null);
          }}
        />
      ) : null}

      {seguindo ? (
        <Espelho apresentador={seguindo.apresentador} cursor={cursor} cliques={cliques} onSair={sair} />
      ) : null}
    </ApresentacaoContexto.Provider>
  );
}

function Convite({
  apresentador,
  contagem,
  onAceitar,
  onRecusar,
}: {
  apresentador: Apresentador;
  contagem: number;
  onAceitar: () => void;
  onRecusar: () => void;
}) {
  return (
    <div className="convite" role="dialog" aria-live="polite">
      <div className="convite-cartao">
        <span className="convite-foto">
          <Retrato apresentador={apresentador} />
        </span>

        <div className="convite-texto">
          <span className="espelho-selo">ao vivo</span>
          <strong>{apresentador.nome}</strong>
          <span>está apresentando. Quer acompanhar a tela?</span>
        </div>

        <div className="convite-acoes">
          <button type="button" className="btn-principal" onClick={onAceitar}>
            Acompanhar
            <i className="convite-contagem">{contagem}</i>
          </button>
          <button type="button" className="btn-secundario" onClick={onRecusar}>
            Continuar sozinho
          </button>
        </div>

        <span className="convite-barra" aria-hidden="true">
          <i style={{ animationDuration: `${SEGUNDOS_PARA_ACEITAR}s` }} />
        </span>
      </div>
    </div>
  );
}

function Espelho({
  apresentador,
  cursor,
  cliques,
  onSair,
}: {
  apresentador: Apresentador;
  cursor: { x: number; y: number } | null;
  cliques: { id: number; x: number; y: number }[];
  onSair: () => void;
}) {
  return (
    <>
      {/* trava o toque em tudo, menos a faixa de cima: quem acompanha assiste
          e sai */}
      <div className="espelho-trava" aria-hidden="true" />

      <div className="espelho-faixa">
        <span className="espelho-foto">
          <Retrato apresentador={apresentador} />
        </span>

        <span className="espelho-nome">
          <span className="espelho-selo">ao vivo</span>
          <strong>{apresentador.nome}</strong>
          <small>está apresentando para você</small>
        </span>

        <button type="button" className="espelho-sair" onClick={onSair}>
          Sair
        </button>
      </div>

      {/* camada com a mesma geometria do palco: o x veio em fração dele */}
      <span className="espelho-camada" aria-hidden="true">
      {cursor ? (
        <span
          className="espelho-cursor"
          style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24">
            <path d="M5 3l14 8-6.2 1.6L10 19z" fill="currentColor" stroke="#04170a" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
          <i>{apresentador.nome}</i>
        </span>
      ) : null}

      {cliques.map((clique) => (
        <span
          className="espelho-clique"
          key={clique.id}
          style={{ left: `${clique.x * 100}%`, top: `${clique.y * 100}%` }}
          aria-hidden="true"
        />
      ))}
      </span>
    </>
  );
}

export function Retrato({ apresentador, pequeno }: { apresentador: Apresentador; pequeno?: boolean }) {
  const iniciais = apresentador.nome
    .split(" ")
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");

  return apresentador.foto ? (
    <img className={`retrato ${pequeno ? "is-pequeno" : ""}`} src={apresentador.foto} alt="" />
  ) : (
    <span className={`retrato is-vazio ${pequeno ? "is-pequeno" : ""}`} aria-hidden="true">
      {iniciais}
    </span>
  );
}
