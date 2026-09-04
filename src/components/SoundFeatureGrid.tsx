"use client";

import { memo } from "react";

import type { SoundFeatureGroup } from "@/lib/sound-features";

type SoundFeatureGridProps = {
  groups: SoundFeatureGroup[];
};

// O usuario nao precisa saber qual motor mediu o que; precisa saber no que
// pode confiar. Duas palavras dao conta: medido ou estimado.
const ORIGIN_LABEL = {
  essentia: "medido",
  dsp: "medido",
  estimativa: "estimado",
} as const;

function SoundFeatureGridBase({ groups }: SoundFeatureGridProps) {
  return (
    <div className="feature-groups">
      {groups.map((group) => (
        <section className="feature-group" key={group.title}>
          <p className="album-label">{group.title}</p>
          {group.note ? <p className="feature-note">{group.note}</p> : null}

          <div className="feature-list">
            {group.features.map((feature) => (
              <div className={`feature-row is-${feature.origin}`} key={feature.id} title={feature.hint}>
                <span className="feature-name">
                  {feature.label}
                  <small>{ORIGIN_LABEL[feature.origin]}</small>
                </span>

                {feature.bar === null ? (
                  <span className="feature-spacer" />
                ) : (
                  <span className="feature-bar">
                    <i style={{ width: `${Math.round(feature.bar * 100)}%` }} />
                  </span>
                )}

                <strong>{feature.display}</strong>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// memo: as props destes blocos nao mudam quando o slider se mexe, entao nao
// ha por que reconstrui-los a cada evento de arrasto.
export const SoundFeatureGrid = memo(SoundFeatureGridBase);
