"use client";

// Estado de espera da explicação escrita. A leitura vem de um modelo de
// linguagem e demora de um a três segundos: barras cinzas sozinhas não dizem
// que tem alguém escrevendo do outro lado. O brilho anima, o texto muda de
// frase e as linhas mantêm a forma do parágrafo que vai chegar.
import { useEffect, useState } from "react";

const FRASES = [
  "Lendo o que mais pesa nessa música…",
  "Comparando com o que costuma dar certo…",
  "Escrevendo a leitura…",
];

/** só os brilhos, para acompanhar o texto depois que ele chega */
export function BrilhoIA() {
  return (
    <span className="pensando-brilhos is-pequeno" aria-hidden="true">
      <span className="pensando-halo" />
      <svg className="brilho brilho-grande" viewBox="0 0 24 24">
        <path d="M12 2.6l1.9 5.6 5.6 1.9-5.6 1.9-1.9 5.6-1.9-5.6L4.5 10.1l5.6-1.9z" fill="currentColor" />
      </svg>
      <svg className="brilho brilho-medio" viewBox="0 0 24 24">
        <path d="M12 4l1.4 4.1 4.1 1.4-4.1 1.4L12 15l-1.4-4.1L6.5 9.5l4.1-1.4z" fill="currentColor" />
      </svg>
    </span>
  );
}

export function PensandoIA() {
  const [frase, setFrase] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrase((atual) => Math.min(atual + 1, FRASES.length - 1));
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="pensando" aria-live="polite" aria-busy="true">
      <span className="pensando-brilhos" aria-hidden="true">
        <span className="pensando-halo" />

        <svg className="brilho brilho-grande" viewBox="0 0 24 24">
          <path
            d="M12 2.6l1.9 5.6 5.6 1.9-5.6 1.9-1.9 5.6-1.9-5.6L4.5 10.1l5.6-1.9z"
            fill="currentColor"
          />
        </svg>

        <svg className="brilho brilho-medio" viewBox="0 0 24 24">
          <path
            d="M12 4l1.4 4.1 4.1 1.4-4.1 1.4L12 15l-1.4-4.1L6.5 9.5l4.1-1.4z"
            fill="currentColor"
          />
        </svg>

        <svg className="brilho brilho-pequeno" viewBox="0 0 24 24">
          <path
            d="M12 6l1 2.9 2.9 1-2.9 1-1 2.9-1-2.9-2.9-1 2.9-1z"
            fill="currentColor"
          />
        </svg>
      </span>

      <p className="pensando-frase" key={frase}>
        {FRASES[frase]}
      </p>

      <div className="pensando-linhas" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
