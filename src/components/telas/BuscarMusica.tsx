"use client";

import { useEffect, useState } from "react";
import { useEstadoEspelhado } from "@/components/apresentacao/Apresentacao";
import { carregar, chaveDeBusca, ESTILOS, jaTemos, prefetch, type Faixa } from "@/lib/catalogo";
import { durationLabel } from "@/lib/insights";
import { PlayButton } from "../PlayButton";

export type { Faixa };

type BuscarMusicaProps = {
  genero: string;
  onGenero: (genero: string) => void;
  /** `estilo` vem vazio quando a pessoa achou a música pelo nome: nesse caso
   * quem decide o estilo da análise é o classificador, e não um chip. */
  onEscolher: (faixa: Faixa, estilo: string) => void;
};

// Estilo e lista na mesma tela: tocar num estilo ja troca a lista embaixo,
// sem ida e volta entre telas para comparar.
export function BuscarMusica({ genero, onGenero, onEscolher }: BuscarMusicaProps) {
  const [busca, setBusca] = useState("");
  // chave da lista mostrada agora: um estilo, ou "q:<termo>" quando a pessoa
  // procurou pelo nome da musica. Espelhada, para quem acompanha ver a mesma
  // lista que quem apresenta escolheu.
  const [chave, setChave] = useEstadoEspelhado("buscar:chave", genero);

  // o que a abertura ja trouxe aparece no primeiro quadro, sem esqueleto
  const prontas = jaTemos(chave);
  const [faixas, setFaixas] = useState<Faixa[]>(prontas ?? []);
  const [carregando, setCarregando] = useState(prontas === null);
  const [erro, setErro] = useState<string | null>(null);

  const porNome = chave.startsWith("q:");
  const termo = porNome ? chave.slice(2) : "";

  useEffect(() => {
    if (!chave) return;
    let valido = true;

    const emMemoria = jaTemos(chave);
    if (emMemoria) {
      setFaixas(emMemoria);
      setCarregando(false);
      setErro(null);
      return;
    }

    setCarregando(true);
    setErro(null);

    carregar(chave)
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
  }, [chave]);

  function enviarBusca() {
    const valor = busca.trim();
    if (valor.length >= 2) setChave(chaveDeBusca(valor));
  }

  function escolherEstilo(estilo: string) {
    setBusca("");
    setChave(estilo);
    onGenero(estilo);
  }

  return (
    <section className="tela">
      <div className="tela-copy">
        <h2>Escolha uma música</h2>
        <p>Procure pelo nome, ou toque num estilo para ver referências.</p>
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
          placeholder="Nome da música ou do artista…"
          aria-label="Buscar uma música pelo nome"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        <button
          type="button"
          className={`campo-ir ${busca ? "is-on" : ""}`}
          onClick={enviarBusca}
          inert={!busca}
        >
          Ir
        </button>
      </div>

      <div className="chips-rolagem" role="group" aria-label="Estilos sugeridos">
        {ESTILOS.map((item) => (
          <button
            type="button"
            key={item.valor}
            className={`chip ${item.valor === chave ? "is-ativo" : ""}`}
            onClick={() => escolherEstilo(item.valor)}
            // tocar ja adianta a busca; se a pessoa so passar o dedo, nada se perde
            onPointerEnter={() => prefetch(item.valor)}
            aria-pressed={item.valor === chave}
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
          <p className="aviso">
            {porNome
              ? `Não achei nenhuma música com "${termo}" que tenha trecho para escutar.`
              : `Não achei músicas de ${chave} com trecho para escutar. Tente outro estilo.`}
          </p>
        ) : null}

        {!carregando
          ? faixas.map((faixa, indice) => (
              <div className="faixa" key={faixa.id} style={{ animationDelay: `${Math.min(indice, 6) * 40}ms` }}>
                <PlayButton
                  sourceId={faixa.id}
                  url={`/api/preview/${faixa.id}`}
                  title={faixa.name}
                  capa={faixa.album.images.at(-1)?.url ?? null}
                />

                <button
                  type="button"
                  className="faixa-toque"
                  onClick={() => onEscolher(faixa, porNome ? "" : chave)}
                >
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
