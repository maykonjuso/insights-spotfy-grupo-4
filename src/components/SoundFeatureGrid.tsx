"use client";

import type { SoundFeatureGroup } from "@/lib/sound-features";

type SoundFeatureGridProps = {
  groups: SoundFeatureGroup[];
};

const ORIGIN_LABEL = {
  essentia: "Essentia",
  dsp: "DSP próprio",
  estimativa: "estimativa",
} as const;

export function SoundFeatureGrid({ groups }: SoundFeatureGridProps) {
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
