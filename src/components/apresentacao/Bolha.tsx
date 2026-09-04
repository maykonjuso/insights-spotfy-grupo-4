"use client";

import { useState } from "react";
import Link from "next/link";
import type { Apresentador } from "@/lib/transmissao";
import { Retrato } from "./Apresentacao";

type BolhaProps = {
  apresentador: Apresentador;
  onEncerrar: () => void;
};

/**
 * Bolha de quem está apresentando. Fica em toda página, porque vive no
 * provedor: antes os controles só existiam no /admin, então era preciso voltar
 * para lá só para encerrar. Agora dá para começar e sair andando pelo app.
 */
export function Bolha({ apresentador, onEncerrar }: BolhaProps) {
  const [aberta, setAberta] = useState(false);

  return (
    <div className={`bolha ${aberta ? "is-aberta" : ""}`}>
      <button
        type="button"
        className="bolha-toque"
        onClick={() => setAberta((atual) => !atual)}
        aria-expanded={aberta}
        aria-label={aberta ? "Fechar controles da apresentação" : "Abrir controles da apresentação"}
      >
        <Retrato apresentador={apresentador} pequeno />
        <span className="bolha-rotulo">ao vivo</span>
      </button>

      <div className="bolha-painel" hidden={!aberta}>
        <div className="bolha-topo">
          <strong>{apresentador.nome}</strong>
          <small>apresentando para quem está com o app aberto</small>
        </div>

        <Link href="/admin" className="bolha-acao">
          Controles
        </Link>

        <button type="button" className="bolha-acao is-parar" onClick={onEncerrar}>
          Encerrar apresentação
        </button>
      </div>
    </div>
  );
}
