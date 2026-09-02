"use client";

type LandingHeroProps = {
  onStart: () => void;
  onUpload: () => void;
};

const DESTAQUES = [
  { titulo: "Prévia real", texto: "Toca 30s da faixa direto na tela, sem sair do app." },
  { titulo: "Leitura do áudio", texto: "Gênero provável, tom, BPM, dançabilidade e mais." },
  { titulo: "Tudo no aparelho", texto: "A análise roda no seu navegador; nada é enviado." },
];

export function LandingHero({ onStart, onUpload }: LandingHeroProps) {
  return (
    <section className="landing">
      <div className="landing-glow" aria-hidden="true" />

      <div className="brand-row landing-brand">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span>Popularity Lab</span>
      </div>

      <div className="landing-copy stagger">
        <p className="eyebrow">Spotify · análise musical</p>
        <h1>Descubra o que a sua música tem por dentro.</h1>
        <p className="landing-lead">
          Escolha um gênero, ouça a prévia e receba a leitura técnica da faixa em três passos — ou envie a sua
          própria música para ser classificada.
        </p>
      </div>

      <div className="landing-actions stagger">
        <button type="button" className="cta-primary" onClick={onStart}>
          Analisar música
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button type="button" className="cta-secondary" onClick={onUpload}>
          Enviar minha música
        </button>
      </div>

      <ul className="landing-highlights stagger">
        {DESTAQUES.map((destaque) => (
          <li key={destaque.titulo}>
            <strong>{destaque.titulo}</strong>
            <span>{destaque.texto}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
