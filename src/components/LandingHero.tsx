"use client";

type LandingHeroProps = {
  onStart: () => void;
  onUpload: () => void;
};

const DESTAQUES = [
  { titulo: "Ouve o arquivo", texto: "Ritmo, tom, energia e gênero medidos no seu próprio aparelho." },
  { titulo: "Consulta o modelo", texto: "Popularidade prevista por um modelo bayesiano de 107 gêneros." },
  { titulo: "Deixa você brincar", texto: "Mude andamento, energia ou gênero e veja o score reagir na hora." },
];

export function LandingHero({ onStart, onUpload }: LandingHeroProps) {
  return (
    <section className="landing">
      <div className="landing-glow" aria-hidden="true" />

      <div className="brand-row landing-brand">
        <div className="brand-mark is-vivo" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span>Popularity Lab</span>
      </div>

      <div className="landing-copy stagger">
        <p className="eyebrow">Spotify · grupo 4</p>
        <h1>Sua música tem cara de hit?</h1>
        <p className="landing-lead">
          Envie um áudio: o navegador mede o som, o modelo estima a popularidade e você ainda pode simular
          outras versões da faixa — outro andamento, outra energia, outro gênero.
        </p>
      </div>

      <div className="landing-actions stagger">
        <button type="button" className="cta-primary" onClick={onUpload}>
          Testar minha música
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button type="button" className="cta-secondary" onClick={onStart}>
          Explorar o catálogo do Spotify
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
