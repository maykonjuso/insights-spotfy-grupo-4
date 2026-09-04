"use client";

import { useRef, useState } from "react";

type EnviarMusicaProps = {
  onArquivo: (arquivo: File) => void;
  erro?: string | null;
};

export function EnviarMusica({ onArquivo, erro }: EnviarMusicaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  return (
    <section className="tela">
      <div className="tela-copy">
        <h2>Qual música você quer testar?</h2>
        <p>Serve qualquer gravação: demo, ensaio, versão final.</p>
      </div>

      <div
        className={`solta ${arrastando ? "is-ativa" : ""}`}
        onDragOver={(evento) => {
          evento.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(evento) => {
          evento.preventDefault();
          setArrastando(false);
          const arquivo = evento.dataTransfer.files[0];
          if (arquivo) onArquivo(arquivo);
        }}
      >
        <span className="solta-icone" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <strong>Arraste o arquivo aqui</strong>
        <small>ou use o botão abaixo</small>
      </div>

      {erro ? (
        <p className="aviso is-erro" role="alert">
          {erro}
        </p>
      ) : null}

      <ul className="lista-dicas">
        <li>Formatos aceitos: MP3, WAV, M4A, OGG e FLAC.</li>
        <li>A partir de 5 segundos de áudio já dá para ler o estilo.</li>
        <li>Nada é enviado para servidor: a análise roda no seu navegador.</li>
      </ul>

      <input
        ref={inputRef}
        type="file"
        className="input-escondido"
        accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/flac"
        aria-label="Escolher arquivo de música"
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0];
          if (arquivo) onArquivo(arquivo);
          evento.target.value = "";
        }}
      />

      <div className="barra-acao">
        <button type="button" className="btn-principal" onClick={() => inputRef.current?.click()}>
          Escolher música
        </button>
      </div>
    </section>
  );
}
