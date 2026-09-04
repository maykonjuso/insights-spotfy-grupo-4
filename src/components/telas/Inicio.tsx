"use client";

import Link from "next/link";
import { siSpotify } from "simple-icons";

type InicioProps = {
  onEnviar: () => void;
  onBuscar: () => void;
};

// Primeira tela: uma frase que explica o app inteiro e dois caminhos, cada um
// a um toque. Nada de menu, nada de configuração antes de começar.
export function Inicio({ onEnviar, onBuscar }: InicioProps) {
  return (
    <section className="inicio">
      <div className="inicio-brilho" aria-hidden="true" />

      <div className="inicio-marca">
        <span className="marca-onda" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        Popularity Lab
      </div>

      <div className="inicio-copy">
        <h1>Essa música tem cara de hit?</h1>
        <p>
          Escolha uma música. O app escuta o som, mede o que dá para medir e diz que nota ela tiraria em
          popularidade.
        </p>
      </div>

      <div className="inicio-opcoes">
        <button type="button" className="opcao is-principal" onClick={onBuscar}>
          <span className="opcao-icone is-spotify" aria-hidden="true">
            {/* marca oficial, vinda do pacote simple-icons */}
            <svg viewBox="0 0 24 24">
              <path d={siSpotify.path} fill="currentColor" />
            </svg>
          </span>
          <span className="opcao-texto">
            <strong>Procurar no Spotify</strong>
            <small>Qualquer música do catálogo</small>
          </span>
          <span className="opcao-seta" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path
                d="M9 6l6 6-6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        <button type="button" className="opcao" onClick={onEnviar}>
          <span className="opcao-icone" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path
                d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="opcao-texto">
            <strong>Enviar a minha música</strong>
            <small>Um arquivo do seu aparelho</small>
          </span>
          <span className="opcao-seta" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path
                d="M9 6l6 6-6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>

      </div>

      <p className="inicio-rodape">
        A música não sai do seu aparelho. Leva menos de um minuto.
        <Link href="/projeto" className="inicio-link">
          Como isso foi feito
        </Link>
      </p>
    </section>
  );
}
