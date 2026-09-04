"use client";

import { useEffect, useState } from "react";
import { carregar, ESTILOS, jaTemos, prefetch, type Faixa } from "@/lib/catalogo";
import { durationLabel } from "@/lib/insights";
import { PlayButton } from "../PlayButton";

export type { Faixa };

type BuscarMusicaProps = {
  genero: string;
  onGenero: (genero: string) => void;
  onEscolher: (faixa: Faixa) => void;
};

// Estilo e lista na mesma tela: tocar num estilo ja troca a lista embaixo,
// sem ida e volta entre telas para comparar.
export function BuscarMusica({ genero, onGenero, onEscolher }: BuscarMusicaProps) {
  // o que a abertura ja trouxe aparece no primeiro quadro, sem esqueleto
  const prontas = jaTemos(genero);
  const [faixas, setFaixas] = useState<Faixa[]>(prontas ?? []);
  const [carregando, setCarregando] = useState(prontas === null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!genero) return;
    let valido = true;

    const emMemoria = jaTemos(genero);
    if (emMemoria) {
      setFaixas(emMemoria);
      setCarregando(false);
      setErro(null);
      return;
    }

    setCarregando(true);
    setErro(null);

    carregar(genero)
      .then((lista) => {
        if (!valido) return;
        setFaixas(lista);
      })
      .catch((falha: Error) => {
        if (!valido) return;
        setFaixas([]);
        setErro(falha.message);
      })
      .finally(() => {
        if (valido) setCarregando(false);
      });

    return () => {
      valido = false;
    };
  }, [genero]);

  function enviarBusca() {
    const valor = busca.trim().toLowerCase();
    if (valor) onGenero(valor);
  }

  return (
    <section className="tela">
      <div className="tela-copy">
        <h2>Escolha uma música</h2>
        <p>Toque no estilo para trocar a lista. O botão de play toca um trecho.</p>
      </div>

      <div className="campo-busca">
        <span aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.9" />
            <path d="M16 16l4 4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </span>
        <input
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") enviarBusca();
          }}
          placeholder="Buscar um estilo, como forró…"
          aria-label="Buscar um estilo musical"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {busca ? (
          <button type="button" onClick={enviarBusca}>
            Ir
          </button>
        ) : null}
      </div>

      <div className="chips-rolagem" role="group" aria-label="Estilos sugeridos">
        {ESTILOS.map((item) => (
          <button
            type="button"
            key={item.valor}
            className={`chip ${item.valor === genero ? "is-ativo" : ""}`}
            onClick={() => onGenero(item.valor)}
            // tocar ja adianta a busca; se a pessoa so passar o dedo, nada se perde
            onPointerEnter={() => prefetch(item.valor)}
            aria-pressed={item.valor === genero}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      {erro ? (
        <p className="aviso is-erro" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="lista-faixas">
        {carregando
          ? Array.from({ length: 6 }, (_, indice) => <div className="faixa-esqueleto" key={indice} />)
          : null}

        {!carregando && faixas.length === 0 && !erro ? (
          <p className="aviso">Não achei músicas de {genero} com trecho para escutar. Tente outro estilo.</p>
        ) : null}

        {!carregando
          ? faixas.map((faixa, indice) => (
              <div className="faixa" key={faixa.id} style={{ animationDelay: `${Math.min(indice, 6) * 40}ms` }}>
                <PlayButton sourceId={faixa.id} url={`/api/preview/${faixa.id}`} title={faixa.name} />

                <button type="button" className="faixa-toque" onClick={() => onEscolher(faixa)}>
                  {faixa.album.images.at(-1)?.url ? (
                    <img src={faixa.album.images.at(-1)?.url} alt="" />
                  ) : (
                    <span className="capa-vazia" aria-hidden="true" />
                  )}

                  <span className="faixa-texto">
                    <strong>{faixa.name}</strong>
                    <small>{faixa.artists.map((artista) => artista.name).join(", ")}</small>
                  </span>

                  <span className="faixa-tempo">{durationLabel(faixa.duration_ms)}</span>
                </button>
              </div>
            ))
          : null}
      </div>
    </section>
  );
}
