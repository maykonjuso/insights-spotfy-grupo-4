"use client";

type WizardHeaderProps = {
  etapa: number;
  total: number;
  titulo: string;
  subtitulo?: string;
  onBack: () => void;
  rotuloVoltar: string;
};

export function WizardHeader({ etapa, total, titulo, subtitulo, onBack, rotuloVoltar }: WizardHeaderProps) {
  return (
    <header className="wizard-header">
      <div className="wizard-top">
        <button type="button" className="wizard-back" onClick={onBack} aria-label={rotuloVoltar}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="wizard-progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={etapa}>
          {Array.from({ length: total }, (_, index) => (
            <span key={index} className={index < etapa ? "is-done" : ""} />
          ))}
        </div>

        <span className="wizard-count">
          {etapa}/{total}
        </span>
      </div>

      <div className="wizard-title">
        <h2>{titulo}</h2>
        {subtitulo ? <p>{subtitulo}</p> : null}
      </div>
    </header>
  );
}
