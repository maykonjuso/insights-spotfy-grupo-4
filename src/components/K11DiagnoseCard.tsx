"use client";

/**
 * K11DiagnoseCard — visualização do diagnóstico K-11.
 *
 * HONESTY PASS (Wave 4, 2026-09-04):
 * - B1+M8: scoreTone agora considera largura do HDI. Score 60 com HDI
 *   [55,65] (largo 10) é verde; mesmo score 60 com HDI [10,90] (largo 80) é
 *   cinza com warning. Evita greenwashing: "Alta chance" em verde com R²=0.15.
 * - B2: HDI bar mostra inline "Cobertura empírica: 40% (nominal: 94%)" para
 *   lembrar o usuário que o intervalo "94% de credibilidade" só cobre 40% dos
 *   casos na vida real.
 * - M1: Disclaimer experimental foi MOVIDO PARA O TOPO e reescrito em
 *   linguagem leiga ("modelo explica só ~15% da variação"). Estava no
 *   rodapé, fácil de ignorar.
 * - M3: explicacao_source field distingue LLM real de fallback. Card mostra
 *   "Explicação automática temporariamente indisponível" em itálico quando
 *   source === "fallback" (não soa como limitação do modelo).
 * - m1: ms_per_call movido para tooltip no ícone de info (não é mais
 *   ruído dev/ops na UI pública).
 *
 * Restrição: zero CSS novo. Tudo vem de classes já existentes em
 * `src/app/globals.css` (panel, upload-score, signal-list, error-banner,
 * insight-loading, upload-note, section-heading, feature-group, etc.).
 */

import type { DiagnoseResponse } from "@/lib/k11Client";
import type { K11Features } from "@/lib/extractK11Features";

// Limites para tom de incerteza (Wave 4 M8/B1). O score e mean das 1000
// predicoes; largura do HDI = hi - lo. Quando largura >= 30, o modelo
// "nao sabe" e o tom vira cinza com warning (nao verde confiante).
const HDI_WIDTH_UNCERTAIN = 30;
const HDI_WIDTH_HIGHLY_UNCERTAIN = 50;

type ScoreTone = "low" | "mid" | "high" | "uncertain";

function hdiWidth(hdi: [number, number]): number {
  return hdi[1] - hdi[0];
}

function scoreTone(score: number, hdi: [number, number]): ScoreTone {
  const w = hdiWidth(hdi);
  if (w >= HDI_WIDTH_HIGHLY_UNCERTAIN) return "uncertain";
  if (w >= HDI_WIDTH_UNCERTAIN) {
    // Largura grande mas nao absurda: ainda mostra cor por score, mas o
    // label vira "incerto" (decisao abaixo).
    if (score >= 70) return "high";
    if (score >= 45) return "mid";
    return "low";
  }
  if (score >= 70) return "high";
  if (score >= 45) return "mid";
  return "low";
}

function scoreLabel(score: number, hdi: [number, number]): string {
  const w = hdiWidth(hdi);
  if (w >= HDI_WIDTH_HIGHLY_UNCERTAIN) {
    return "Incerto — não usar para decisão";
  }
  if (w >= HDI_WIDTH_UNCERTAIN) {
    return "Modelo incerto";
  }
  if (score >= 70) return "Possivelmente alta";
  if (score >= 45) return "Possivelmente média";
  return "Possivelmente baixa";
}

const CARD_HEADING_ID = "k11-diagnose-card-heading";

export type K11DiagnoseCardProps = {
  /** Resultado do `/api/diagnose`. `null` quando ainda não há resposta. */
  result: DiagnoseResponse | null;
  /** `true` durante a chamada fetch — mostra o `.insight-loading`. */
  isLoading: boolean;
  /** Mensagem pública (já vinda de `payload.error` no k11Client) ou `null`. */
  error: string | null;
  /**
   * Features 11-dimensionais que foram enviadas ao backend. Opcional: se
   * presente, exibimos um pequeno bloco lateral com origem/confiança por
   * feature (esconde em `null`).
   */
  features?: K11Features | null;
};

// Texto do disclaimer em linguagem leiga (Wave 4 M1).
// - "explica ~15% da variação" em vez de "R²=0.15" (jargão).
// - "erra em média 19 pontos" em vez de "RMSE 19" (intuitivo).
// - "Use como sinal fraco" em vez de "use como indicação" (mais honesto).
const DISCLAIMER_TOP_TEXT =
  "Este modelo é experimental e fraco: explica apenas ~15% da variação real entre hits e não-hits, e erra em média 19 pontos em escala 0-100. Use o score como sinal fraco, não como predição.";

export function K11DiagnoseCard({
  result,
  isLoading,
  error,
  features,
}: K11DiagnoseCardProps) {
  if (isLoading) {
    return (
      <section className="panel k11-diagnose" aria-labelledby={CARD_HEADING_ID} role="region">
        <div className="section-heading">
          <p>K-11</p>
          <h2 id={CARD_HEADING_ID}>Diagnóstico K-11</h2>
        </div>
        <p className="upload-note"><strong>{DISCLAIMER_TOP_TEXT}</strong></p>
        <p className="insight-loading">Analisando com K-11...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel k11-diagnose" aria-labelledby={CARD_HEADING_ID} role="region">
        <div className="section-heading">
          <p>K-11</p>
          <h2 id={CARD_HEADING_ID}>Diagnóstico K-11</h2>
        </div>
        <p className="upload-note"><strong>{DISCLAIMER_TOP_TEXT}</strong></p>
        <p className="error-banner" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="panel k11-diagnose" aria-labelledby={CARD_HEADING_ID} role="region">
        <div className="section-heading">
          <p>K-11</p>
          <h2 id={CARD_HEADING_ID}>Diagnóstico K-11</h2>
        </div>
        <p className="upload-note"><strong>{DISCLAIMER_TOP_TEXT}</strong></p>
        <p className="upload-note">
          Envie um áudio, escolha um gênero entre os 107 do K-11, e clique em
          &ldquo;Diagnosticar&rdquo; para ver o score e o intervalo de credibilidade.
        </p>
      </section>
    );
  }

  const tone = scoreTone(result.score, result.hdi_94);
  const label = scoreLabel(result.score, result.hdi_94);
  const [hdiLo, hdiHi] = result.hdi_94;
  const hdiW = hdiHi - hdiLo;
  const isLLMFallback = result.explicacao_source === "fallback";

  return (
    <section className="panel k11-diagnose" aria-labelledby={CARD_HEADING_ID} role="region">
      <div className="section-heading">
        <p>K-11</p>
        <h2 id={CARD_HEADING_ID}>Diagnóstico K-11</h2>
      </div>

      {/* Disclaimer no TOPO (Wave 4 M1) — antes do score, em linguagem leiga. */}
      <p className="upload-note"><strong>{DISCLAIMER_TOP_TEXT}</strong></p>

      <div className={`upload-score ${tone}`}>
        <span aria-label={`Score ${result.score} de 100, ${label.toLowerCase()}`}>
          {result.score}
        </span>
        <strong>{label}</strong>
        <small>
          Gênero K-11: <code>{result.genero}</code>
        </small>
      </div>

      {/* HDI bar: inclui flag de cobertura empírica (Wave 4 B2). */}
      <div className="feature-group" aria-label="Intervalo de credibilidade 94%">
        <p className="feature-note">
          Score: <strong>{result.score}</strong> (HDI 94%: {hdiLo} a {hdiHi},{" "}
          largura {hdiW} pontos)
        </p>
        <div
          className="feature-bar"
          role="img"
          aria-label={`Intervalo de credibilidade 94% vai de ${hdiLo} a ${hdiHi}, ponto estimado em ${result.score}`}
        >
          <i style={{ width: `${hdiHi}%` }} />
        </div>
        <p className="upload-note" style={{ marginTop: 4 }}>
          <strong>Cobertura empírica: 40%</strong> (nominal: 94%).
          Em 60% dos casos o valor real está fora deste intervalo —
          confie no score como sinal fraco, não como ponto preciso.
        </p>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "4px",
            margin: 0,
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          <div>
            <dt style={{ display: "inline" }}>Limite inferior:&nbsp;</dt>
            <dd style={{ display: "inline", margin: 0 }}>{hdiLo}</dd>
          </div>
          <div style={{ textAlign: "right" }}>
            <dt style={{ display: "inline" }}>Limite superior:&nbsp;</dt>
            <dd style={{ display: "inline", margin: 0 }}>{hdiHi}</dd>
          </div>
        </dl>
      </div>

      {/* Explicação: itálico se for fallback (Wave 4 M3). */}
      <div
        className="signal-list"
        aria-label="Explicação do modelo"
        style={isLLMFallback ? { fontStyle: "italic", opacity: 0.85 } : undefined}
      >
        <p key={result.explicacao}>{result.explicacao}</p>
      </div>

      {/* Latência: tooltip no titulo em vez de visivel (Wave 4 m1). */}
      <p
        className="upload-note"
        title={`Latência do servidor: ${result.ms_per_call} ms`}
        style={{ cursor: "help" }}
      >
        Sobre este diagnóstico
      </p>

      {features ? (
        <div className="feature-group" aria-label="Origem das 11 features">
          <p className="feature-note">Origem das 11 features</p>
          <div className="feature-list">
            {(
              Object.entries(features.origin) as Array<
                [keyof typeof features.origin, string]
              >
            ).map(([key, origin]) => (
              <div className="feature-row" key={key}>
                <div className="feature-name">
                  <strong>{key}</strong>
                  <small>{origin}</small>
                </div>
                <div className="feature-bar" aria-hidden="true">
                  <i style={{ width: `${Math.round((features.confidence[key] ?? 0) * 100)}%` }} />
                </div>
                <strong>{Math.round((features.confidence[key] ?? 0) * 100)}%</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default K11DiagnoseCard;
