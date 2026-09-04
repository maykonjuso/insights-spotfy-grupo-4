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
  rolagem: number;
};

type Contexto = {
  /** estado recebido de quem está transmitindo, quando estou acompanhando */
  seguindo: Estado | null;
  /** publica onde estou, quando sou eu quem transmite */
  transmitir: (posicao: Posicao) => void;
  iniciar: (apresentador: Apresentador) => void;
  encerrar: () => void;
  transmitindo: boolean;
  apresentador: Apresentador | null;
};

const ApresentacaoContexto = createContext<Contexto | null>(null);

export function useApresentacao() {
  const contexto = useContext(ApresentacaoContexto);
  if (!contexto) throw new Error("useApresentacao fora do provedor");
  return contexto;
}

// Quem apresenta continua sendo quem apresenta ao trocar de aba ou de rota.
// Sem isto, abrir o app numa segunda aba criava um provedor novo que se achava
// espectador, e a transmissão morria assim que o apresentador saía do /admin.
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

const SEGUNDOS_PARA_ACEITAR = 5;
/** um estado sem sinal por mais que isso significa que a transmissão acabou */
const SILENCIO_ATE_ENCERRAR = 20_000;

export function Apresentacao({ children }: { children: ReactNode }) {
  const canal = useRef<Canal | null>(null);
  const router = useRouter();
  const rotaAtual = usePathname();

  const [convite, setConvite] = useState<Apresentador | null>(null);
  const [contagem, setContagem] = useState(SEGUNDOS_PARA_ACEITAR);
  const [seguindo, setSeguindo] = useState<Estado | null>(null);
  const [recusados, setRecusados] = useState<string[]>([]);
  const [transmitindo, setTransmitindo] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [cliques, setCliques] = useState<{ id: number; x: number; y: number }[]>([]);

  const euApresento = useRef<Apresentador | null>(null);
  const ultimoSinal = useRef(0);
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
      // navegador sem storage: a transmissão só não sobrevive à troca de aba
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
        setConvite((atual) => {
          if (atual) return atual;
          const id = mensagem.estado.apresentador.id;
          // já estou seguindo, ou já disse que não
          if (recusados.includes(id)) return null;
          setContagem(SEGUNDOS_PARA_ACEITAR);
          return mensagem.estado.apresentador;
        });
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
  useEffect(() => {
    if (!seguindo) return;

    if (seguindo.rota && seguindo.rota !== rotaAtual) router.push(seguindo.rota);

    const alturaRolavel = document.documentElement.scrollHeight - window.innerHeight;
    if (alturaRolavel > 0) {
      // fração em vez de pixels: a tela de quem assiste tem outro tamanho, e
      // copiar o scrollY cru pararia no meio de outro parágrafo
      window.scrollTo({ top: seguindo.rolagem * alturaRolavel, behavior: "smooth" });
    }
  }, [seguindo, rotaAtual, router]);

  useEffect(() => {
    if (!seguindo) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [seguindo]);

  // ---- envio
  const transmitir = useCallback((posicao: Posicao) => {
    const eu = euApresento.current;
    if (!eu) return;
    canal.current?.enviar({
      tipo: "estado",
      estado: { ...posicao, apresentador: eu, em: Date.now() },
    });
  }, []);

  const iniciar = useCallback((novo: Apresentador) => {
    euApresento.current = novo;
    setApresentador(novo);
    setTransmitindo(true);
    setSeguindo(null);
    setConvite(null);
    try {
      window.localStorage.setItem(CHAVE, JSON.stringify(novo));
    } catch {
      // sem storage a transmissão vale só nesta aba, e isso é aceitável
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
      canal.current?.enviar({
        tipo: "cursor",
        x: evento.clientX / window.innerWidth,
        y: evento.clientY / window.innerHeight,
      });
    }

    function aoClicar(evento: PointerEvent) {
      canal.current?.enviar({
        tipo: "clique",
        x: evento.clientX / window.innerWidth,
        y: evento.clientY / window.innerHeight,
      });
    }

    window.addEventListener("pointermove", aoMover, { passive: true });
    window.addEventListener("pointerdown", aoClicar, { passive: true });
    return () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerdown", aoClicar);
    };
  }, [transmitindo, servidor]);

  const valor = useMemo<Contexto>(
    () => ({ seguindo, transmitir, iniciar, encerrar, transmitindo, apresentador }),
    [seguindo, transmitir, iniciar, encerrar, transmitindo, apresentador],
  );

  return (
    <ApresentacaoContexto.Provider value={valor}>
      {children}

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
        <Retrato apresentador={apresentador} />

        <div className="convite-texto">
          <strong>{apresentador.nome} está apresentando</strong>
          <span>Quer acompanhar a tela dele?</span>
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
      {/* trava tudo menos a faixa de cima: quem acompanha assiste e sai */}
      <div className="espelho-trava" aria-hidden="true" />

      <div className="espelho-faixa">
        <Retrato apresentador={apresentador} pequeno />
        <span className="espelho-nome">
          Acompanhando <strong>{apresentador.nome}</strong>
        </span>
        <button type="button" className="espelho-sair" onClick={onSair}>
          Sair
        </button>
      </div>

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
