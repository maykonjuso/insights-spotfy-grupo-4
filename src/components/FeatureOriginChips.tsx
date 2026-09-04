"use client";

/**
 * FeatureOriginChips — disclosure honesto de origem + confiança por feature K-11.
 *
 * Mostra 11 chips (um por feature consumida pelo modelo K=11) com a etiqueta
 * curta em PT-BR, a origem ("essentia" | "dsp" | "proxy" | "metadata") e a
 * confiança estimada (0..1 → %). O usuário leigo vê de relance quais features
 * foram medidas diretamente e quais são estimativas/proxies (chip amarelo).
 *
 * Sem CSS novo: reusa tokens de cor inline (cores por origem) e o padrão de
 * help text do `upload-note` para a legenda expansível.
 *
 * Props:
 *   - origin     : mapeamento feature → quem produziu o valor
 *   - confidence : mapeamento feature → confiança 0..1
 *
 * Origens:
 *   - essentia  : descritor oficial Essentia (alta confiança)
 *   - dsp       : calculado via DSP próprio (FFT, RMS, autocorrelação)
 *   - proxy     : heurística multi-fonte (Meyda/Spotify-style, fraca)
 *   - metadata  : veio de input externo, não do áudio
 */

import { useState, type CSSProperties } from "react";
import type { K11FeatureOrigin, K11FeatureKey } from "@/lib/extractK11Features";

type Props = {
  origin: Record<K11FeatureKey, K11FeatureOrigin>;
  confidence: Record<K11FeatureKey, number>;
};

// Ordem canônica das 11 features consumidas pelo K-11 (mesma ordem de
// feature_names.json). Mantém a leitura estável independente do objeto.
const FEATURE_ORDER: K11FeatureKey[] = [
  "danceability",
  "energy",
  "loudness",
  "speechiness",
  "acousticness",
  "instrumentalness",
  "liveness",
  "valence",
  "tempo",
  "mode_bin",
  "explicit",
];

// Rótulos PT-BR curtos (espelham llmExplanation.ts quando aplicável; ajustados
// aqui para o formato compacto de chip).
const FEATURE_LABEL_PT: Record<K11FeatureKey, string> = {
  danceability: "dançabilidade",
  energy: "energia",
  loudness: "loudness",
  speechiness: "fala",
  acousticness: "acusticidade",
  instrumentalness: "instrumentalidade",
  liveness: "audiência ao vivo",
  valence: "valência",
  tempo: "tempo",
  mode_bin: "tom",
  explicit: "explícito",
};

const ORIGIN_LABEL: Record<K11FeatureOrigin, string> = {
  essentia: "essentia",
  dsp: "DSP",
  proxy: "proxy",
  metadata: "metadata",
};

// Cores por origem (hexes explícitos do design system Wave 3).
// - essentia : verde (igual --green)   → medido diretamente
// - dsp      : azul (não existe token, hex externo) → DSP próprio
// - proxy    : amarelo (próximo de --amber, mas hex explícito do brief) → estimativa
// - metadata : cinza (próximo de --muted, mas hex explícito) → input externo
const ORIGIN_COLOR: Record<K11FeatureOrigin, { fg: string; bg: string; border: string }> = {
  essentia: { fg: "#061509", bg: "#1db954", border: "#1db954" },
  dsp: { fg: "#0b1d3a", bg: "#3b82f6", border: "#3b82f6" },
  proxy: { fg: "#3a2a06", bg: "#f59e0b", border: "#f59e0b" },
  metadata: { fg: "#111111", bg: "#6b7280", border: "#6b7280" },
};

const ORIGIN_TOOLTIP: Record<K11FeatureOrigin, string> = {
  essentia: "Esta feature é medida diretamente via essentia.js (WASM) — descritor oficial de áudio.",
  dsp: "Calculada por DSP próprio (FFT, RMS, autocorrelação) calibrado contra a distribuição Spotify.",
  proxy: "Estimativa heurística multi-fonte. Essentia não cobre o conceito (ex.: plateia, valência) — confiança limitada.",
  metadata: "Veio de metadata da track (ex.: flag explícito). Não é extraído do áudio.",
};

function percent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function chipStyle(origin: K11FeatureOrigin, confidence: number): CSSProperties {
  const color = ORIGIN_COLOR[origin];
  // Confiança baixa (≤ 0.5) ganha um anel mais grosso e borda mais saturada
  // para sinalizar que aquela feature é "fraca" mesmo dentro da sua origem.
  const isWeak = confidence <= 0.5;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.02em",
    lineHeight: 1.2,
    color: color.fg,
    background: color.bg,
    border: `1.5px solid ${isWeak ? "#fff" : color.border}`,
    boxShadow: isWeak ? "0 0 0 1px rgba(255,255,255,0.25)" : "none",
    cursor: "help",
    whiteSpace: "nowrap",
  };
}

export function FeatureOriginChips({ origin, confidence }: Props) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="k11-chips">
      <div className="album-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>Origem das 11 features</span>
        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          aria-expanded={helpOpen}
          aria-label="O que significam essentia, DSP, proxy e metadata?"
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 18,
            height: 18,
            padding: 0,
            border: "1px solid var(--line)",
            borderRadius: 999,
            background: "var(--panel-2)",
            color: "var(--muted)",
            fontSize: 11,
            fontWeight: 800,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ?
        </button>
      </div>

      {helpOpen ? (
        <div className="signal-list" style={{ marginTop: 6 }}>
          <p>
            <strong style={{ color: "#1db954" }}>essentia</strong> — medida
            diretamente pelo descritor oficial Essentia (WASM rodando no seu
            navegador). Alta confiança.
          </p>
          <p>
            <strong style={{ color: "#3b82f6" }}>DSP</strong> — calculada por
            DSP próprio (FFT, RMS, autocorrelação). Confiança média; calibrada
            contra a distribuição do Spotify.
          </p>
          <p>
            <strong style={{ color: "#f59e0b" }}>proxy</strong> — estimativa
            heurística multi-fonte. Essentia não cobre o conceito (plateia,
            valência, fala). Confiança limitada — trate como chute informado.
          </p>
          <p>
            <strong style={{ color: "#6b7280" }}>metadata</strong> — veio de
            metadata externa (ex.: flag explícito). Não foi extraído do áudio.
          </p>
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 6,
        }}
      >
        {FEATURE_ORDER.map((feature) => {
          const originKey = origin[feature];
          const conf = confidence[feature] ?? 0;
          const label = FEATURE_LABEL_PT[feature];
          const originLabel = ORIGIN_LABEL[originKey];
          const tooltip = `${label}: ${ORIGIN_TOOLTIP[originKey]} Confiança estimada: ${percent(conf)}.`;
          return (
            <span key={feature} style={chipStyle(originKey, conf)} title={tooltip}>
              {label} · {originLabel} · {percent(conf)}
            </span>
          );
        })}
      </div>

      <p className="upload-note" style={{ marginTop: 6 }}>
        Cada chip mostra de onde veio o valor e qual a confiança estimada. Chip
        amarelo (proxy) é estimativa, não medição — não trate como verdade.
      </p>
    </div>
  );
}

export default FeatureOriginChips;
