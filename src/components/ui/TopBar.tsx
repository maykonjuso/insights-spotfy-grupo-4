"use client";

import { useEffect, useRef } from "react";

type TopBarProps = {
  titulo: string;
  onVoltar?: () => void;
  rotuloVoltar?: string;
};

export function TopBar({ titulo, onVoltar, rotuloVoltar = "Voltar" }: TopBarProps) {
  const barra = useRef<HTMLElement>(null);

  // A altura vai para uma variavel CSS medida de verdade, e nao somada na mao.
  // O resumo fixo da nota se ancora nela; um pixel de diferenca no calculo
  // (fonte maior, recorte da tela, zoom) fazia a borda de cima do resumo
  // desaparecer por baixo desta barra.
  useEffect(() => {
    const alvo = barra.current;
    if (!alvo) return;

    // getBoundingClientRect e fracionario; offsetHeight arredonda para inteiro,
    // e meio pixel de diferenca virava uma fresta sem desfoque entre esta barra
    // e o veu de baixo, aparecendo como um risco na tela.
    const medir = () =>
      document.documentElement.style.setProperty(
        "--alt-topbar",
        `${alvo.getBoundingClientRect().height}px`,
      );

    medir();

    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  return (
    <header className="topbar" ref={barra}>
      {onVoltar ? (
        <button type="button" className="icone-btn" onClick={onVoltar} aria-label={rotuloVoltar}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : (
        <span className="icone-btn is-vazio" aria-hidden="true" />
      )}

      <h1 className="topbar-titulo">{titulo}</h1>
      <span className="icone-btn is-vazio" aria-hidden="true" />
    </header>
  );
}
