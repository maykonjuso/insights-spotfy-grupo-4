"use client";

type TopBarProps = {
  titulo: string;
  onVoltar?: () => void;
  rotuloVoltar?: string;
};

export function TopBar({ titulo, onVoltar, rotuloVoltar = "Voltar" }: TopBarProps) {
  return (
    <header className="topbar">
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
