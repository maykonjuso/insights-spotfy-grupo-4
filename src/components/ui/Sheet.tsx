"use client";

import { useEffect, useRef, type ReactNode } from "react";

type SheetProps = {
  aberta: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
};

// Folha inferior para uma tarefa curta e isolada, como escolher o estilo.
// Regras que ela precisa cumprir: nome da tarefa no topo, saída óbvia
// (botão e toque no fundo), Esc no teclado e rolagem que não vaza para a
// página atrás.
export function Sheet({ aberta, titulo, onFechar, children }: SheetProps) {
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberta) return;

    const anterior = document.activeElement as HTMLElement | null;
    painel.current?.focus();
    document.body.style.overflow = "hidden";

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") onFechar();
    }

    window.addEventListener("keydown", aoTeclar);

    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = "";
      anterior?.focus?.();
    };
  }, [aberta, onFechar]);

  if (!aberta) return null;

  return (
    <div className="sheet-camada">
      <button type="button" className="sheet-fundo" onClick={onFechar} aria-label="Fechar" />

      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        ref={painel}
      >
        <div className="sheet-topo">
          <span className="sheet-alca" aria-hidden="true" />
          <h2>{titulo}</h2>
          <button type="button" className="icone-btn" onClick={onFechar} aria-label="Fechar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="sheet-corpo">{children}</div>
      </div>
    </div>
  );
}
