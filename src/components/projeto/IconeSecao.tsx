"use client";

// Ícones que se movem. Cada seção tem o seu, e a animação diz alguma coisa
// sobre o assunto: o funil afunila, a dispersão espalha, a curva se desenha.
// Tudo em transform e opacity, e o bloco de prefers-reduced-motion no fim do
// CSS desliga o movimento sem quebrar o desenho.

export type TipoIcone =
  | "onda"
  | "duvida"
  | "passos"
  | "duplo"
  | "alvo"
  | "perguntas"
  | "funil"
  | "dispersao"
  | "curva"
  | "bandeira";

function Onda() {
  return (
    <span className="ic ic-onda">
      {Array.from({ length: 7 }, (_, i) => (
        <i key={i} style={{ animationDelay: `${i * 110}ms` }} />
      ))}
    </span>
  );
}

function Duvida() {
  return (
    <span className="ic ic-duvida">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </span>
  );
}

function Passos() {
  return (
    <span className="ic ic-passos">
      {Array.from({ length: 4 }, (_, i) => (
        <i key={i} style={{ animationDelay: `${i * 320}ms` }} />
      ))}
    </span>
  );
}

function Duplo() {
  return (
    <span className="ic ic-duplo">
      <i />
      <i />
    </span>
  );
}

function Alvo() {
  return (
    <span className="ic ic-alvo">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="ic-anel" cx="32" cy="32" r="26" />
        <circle className="ic-anel is-2" cx="32" cy="32" r="17" />
        <circle className="ic-centro" cx="32" cy="32" r="6" />
      </svg>
    </span>
  );
}

function Perguntas() {
  return (
    <span className="ic ic-perguntas">
      {["?", "?", "?"].map((simbolo, i) => (
        <i key={i} style={{ animationDelay: `${i * 380}ms` }}>
          {simbolo}
        </i>
      ))}
    </span>
  );
}

function Funil() {
  return (
    <span className="ic ic-funil">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path className="ic-traco" d="M8 12h48L38 34v18l-12 6V34z" />
      </svg>
      {Array.from({ length: 4 }, (_, i) => (
        <i key={i} style={{ animationDelay: `${i * 420}ms` }} />
      ))}
    </span>
  );
}

function Dispersao() {
  // posições fixas: um espalhamento que parece aleatório mas é igual sempre
  const pontos = [
    [14, 46], [26, 28], [38, 40], [50, 22], [20, 16],
    [44, 52], [32, 12], [56, 38], [10, 30], [48, 8],
  ];
  return (
    <span className="ic ic-dispersao">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        {pontos.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.2" style={{ animationDelay: `${i * 130}ms` }} />
        ))}
      </svg>
    </span>
  );
}

function Curva() {
  return (
    <span className="ic ic-curva">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path className="ic-faixa" d="M4 52c14 0 12-36 28-36s14 36 28 36z" />
        <path className="ic-linha" d="M4 52c14 0 12-36 28-36s14 36 28 36" />
      </svg>
    </span>
  );
}

function Bandeira() {
  return (
    <span className="ic ic-bandeira">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path className="ic-traco" d="M16 56V10" />
        <path className="ic-pano" d="M16 12h30l-7 10 7 10H16z" />
      </svg>
    </span>
  );
}

const MAPA: Record<TipoIcone, () => React.ReactElement> = {
  onda: Onda,
  duvida: Duvida,
  passos: Passos,
  duplo: Duplo,
  alvo: Alvo,
  perguntas: Perguntas,
  funil: Funil,
  dispersao: Dispersao,
  curva: Curva,
  bandeira: Bandeira,
};

export function IconeSecao({ tipo }: { tipo: TipoIcone }) {
  const Desenho = MAPA[tipo];
  return (
    <span className="secao-icone" aria-hidden="true">
      <Desenho />
    </span>
  );
}
