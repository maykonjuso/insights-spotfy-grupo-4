"use client";

import { FEATURE_META, formatFeature, type ModelFeatureKey } from "@/lib/model-bridge";
import type { TrackFeatures } from "@/lib/model/types";
import { Alterna } from "./ui/Alterna";

// As features que fazem sentido o usuario mexer para simular uma versao
// diferente da faixa. instrumentalness/liveness/speechiness ficam de fora dos
// controles porque ja entram como estimativa grosseira -- deixar arrastar daria
// falsa precisao a um numero que nem medimos direito.
const AJUSTAVEIS: ModelFeatureKey[] = ["danceability", "energy", "valence", "tempo", "loudness", "acousticness"];
const ALTERNAVEIS: ModelFeatureKey[] = ["explicit", "mode_bin"];

type WhatIfPanelProps = {
  features: TrackFeatures;
  base: TrackFeatures;
  onChange: (features: TrackFeatures) => void;
  onReset: () => void;
};

export function WhatIfPanel({ features, base, onChange, onReset }: WhatIfPanelProps) {
  const alterado = AJUSTAVEIS.concat(ALTERNAVEIS).some((chave) => features[chave] !== base[chave]);

  function definir(chave: ModelFeatureKey, valor: number) {
    onChange({ ...features, [chave]: valor } as TrackFeatures);
  }

  return (
    <section className="bloco">
      <p className="bloco-nota">
        Arraste e a nota se refaz na hora, sem precisar regravar nada.
      </p>

      <div className="slider-list">
        {AJUSTAVEIS.map((chave) => {
          const meta = FEATURE_META.find((item) => item.key === chave)!;
          const valor = features[chave] as number;
          const original = base[chave] as number;
          const mexido = Math.abs(valor - original) > meta.step / 2;

          return (
            <div className={`slider-row ${mexido ? "is-mexido" : ""}`} key={chave}>
              <label htmlFor={`slider-${chave}`}>
                {meta.label}
                <strong>{formatFeature(meta, valor)}</strong>
              </label>
              <input
                id={`slider-${chave}`}
                type="range"
                min={meta.min}
                max={meta.max}
                step={meta.step}
                value={valor}
                onChange={(evento) => definir(chave, Number(evento.target.value))}
              />
              <Alterna ligado={mexido}>
                <small>original {formatFeature(meta, original)}</small>
              </Alterna>
            </div>
          );
        })}
      </div>

      <div className="toggle-row">
        {ALTERNAVEIS.map((chave) => {
          const meta = FEATURE_META.find((item) => item.key === chave)!;
          const ligado = features[chave] === 1;
          return (
            <button
              type="button"
              key={chave}
              className={`toggle-chip ${ligado ? "is-on" : ""}`}
              aria-pressed={ligado}
              onClick={() => definir(chave, ligado ? 0 : 1)}
            >
              {meta.label}
              <span aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <Alterna ligado={alterado}>
        <button type="button" className="btn-secundario" onClick={onReset}>
          Voltar à música original
        </button>
      </Alterna>
    </section>
  );
}
