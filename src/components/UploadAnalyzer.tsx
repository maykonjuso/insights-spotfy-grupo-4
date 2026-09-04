"use client";

import { useEffect, useRef, useState } from "react";
import { analyzeSamples } from "@/lib/audio-analysis";
import { decodeAudioFile } from "@/lib/audio-decode";
import { FEATURE_SAMPLE_RATE, type AudioSummary } from "@/lib/audio-features";
import type { EssentiaDescriptors } from "@/lib/essentia-analysis";
import {
  extractK11Features,
  type K11Features,
} from "@/lib/extractK11Features";
import { modelInfo, type GenreScore } from "@/lib/genre-classifier";
import { durationLabel } from "@/lib/insights";
import {
  diagnose as k11Diagnose,
  fetchGeneros,
  type DiagnoseResponse,
} from "@/lib/k11Client";
import { stopPlayback } from "@/lib/preview-player";
import { buildSoundFeatures } from "@/lib/sound-features";
import { FeatureOriginChips } from "./FeatureOriginChips";
import { K11DiagnoseCard } from "./K11DiagnoseCard";
import { PreviewPlayer } from "./PreviewPlayer";
import { SoundFeatureGrid } from "./SoundFeatureGrid";

type UploadResult = {
  id: string;
  fileName: string;
  objectUrl: string;
  score: number;
  label: string;
  tone: "low" | "mid" | "high";
  durationMs: number;
  energy: number;
  loudnessDb: number;
  dynamicRange: number;
  peak: number;
  clippedSamples: number;
  tempo: number;
  genres: GenreScore[];
  descriptors: EssentiaDescriptors | null;
  descriptorsError?: string;
  summary: AudioSummary | null;
  signals: string[];
  // Wave 3 — K-11 (estado por-resultado pra preservar diagnostico entre cards).
  k11Features: K11Features | null;
  k11Result: DiagnoseResponse | null;
  k11Genero: string | null;
};

const MODEL = modelInfo();

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function metricPercent(value: number) {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function db(value: number) {
  return `${Math.round(value)} dB`;
}

function scoreLabel(score: number) {
  if (score >= 70) return "Alta chance";
  if (score >= 45) return "Potencial médio";
  return "Baixa chance";
}

function scoreTone(score: number): UploadResult["tone"] {
  if (score >= 70) return "high";
  if (score >= 45) return "mid";
  return "low";
}

function analyzeChannel(channel: Float32Array, duration: number) {
  const step = Math.max(1, Math.floor(channel.length / 220_000));
  let sumSquares = 0;
  let peak = 0;
  let clippedSamples = 0;
  let count = 0;

  for (let index = 0; index < channel.length; index += step) {
    const absolute = Math.abs(channel[index]);
    sumSquares += absolute * absolute;
    peak = Math.max(peak, absolute);
    if (absolute >= 0.98) clippedSamples += 1;
    count += 1;
  }

  const rms = Math.sqrt(sumSquares / Math.max(1, count));
  const loudnessDb = 20 * Math.log10(Math.max(rms, 0.000001));
  const chunkSize = Math.max(1024, Math.floor(channel.length / Math.max(12, Math.min(80, Math.round(duration * 2)))));
  const chunks: number[] = [];

  for (let start = 0; start < channel.length; start += chunkSize) {
    let chunkSquares = 0;
    let chunkCount = 0;

    for (let index = start; index < Math.min(channel.length, start + chunkSize); index += step) {
      const value = channel[index];
      chunkSquares += value * value;
      chunkCount += 1;
    }

    if (chunkCount > 0) chunks.push(Math.sqrt(chunkSquares / chunkCount));
  }

  const quiet = Math.min(...chunks);
  const loud = Math.max(...chunks);
  const dynamicRange = clamp((loud - quiet) / 0.45, 0, 1);

  return {
    energy: clamp(rms / 0.28, 0, 1),
    loudnessDb,
    dynamicRange,
    peak: clamp(peak, 0, 1),
    clippedSamples,
  };
}

type ScoreInput = Pick<UploadResult, "durationMs" | "energy" | "dynamicRange" | "peak" | "clippedSamples">;

function buildUploadScore(result: ScoreInput) {
  let score = 42;
  const signals: string[] = [];
  const minutes = result.durationMs / 60000;

  if (minutes >= 2 && minutes <= 4) {
    score += 16;
    signals.push("Duração dentro da faixa comum para streaming e playlists.");
  } else if (minutes < 1.5) {
    score -= 10;
    signals.push("Duração muito curta pode dificultar leitura de retenção.");
  } else {
    score -= 6;
    signals.push("Duração longa pede edição ou versão mais direta para descoberta.");
  }

  if (result.energy >= 0.45 && result.energy <= 0.82) {
    score += 14;
    signals.push("Energia média/alta sugere boa presença sem soar excessivamente comprimida.");
  } else if (result.energy > 0.82) {
    score += 4;
    signals.push("Energia muito alta: impacto bom, mas vale conferir fadiga e mix.");
  } else {
    score -= 4;
    signals.push("Energia baixa pode funcionar em nichos, mas reduz apelo imediato.");
  }

  if (result.dynamicRange >= 0.18 && result.dynamicRange <= 0.68) {
    score += 10;
    signals.push("Dinâmica equilibrada: há contraste sem perder consistência.");
  } else if (result.dynamicRange > 0.68) {
    score += 2;
    signals.push("Dinâmica muito aberta; master pode precisar de mais controle.");
  } else {
    score -= 5;
    signals.push("Pouca dinâmica detectada; pode indicar compressão forte demais.");
  }

  if (result.peak >= 0.72 && result.peak <= 0.97) {
    score += 8;
    signals.push("Pico em zona saudável para volume percebido.");
  } else if (result.peak > 0.97 || result.clippedSamples > 0) {
    score -= 8;
    signals.push("Há sinal perto de clipping; revise ganho/master antes de publicar.");
  } else {
    score -= 3;
    signals.push("Pico baixo: a música pode soar menos competitiva em volume.");
  }

  score = Math.round(clamp(score));

  return {
    score,
    label: scoreLabel(score),
    tone: scoreTone(score),
    signals: signals.slice(0, 4),
  };
}

export function UploadAnalyzer() {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wave 3 — K-11 (estado da operação em curso; o resultado persistido
  // também vive no `UploadResult` correspondente, então a UI re-renderiza
  // sem perder diagnóstico quando o usuário interage com outros cards).
  const [k11Genres, setK11Genres] = useState<string[]>([]);
  const [k11GenresError, setK11GenresError] = useState<string | null>(null);
  const [selectedK11Genre, setSelectedK11Genre] = useState<string>("");
  // Estado "ativo" — refletido no card atualmente em diagnóstico.
  const [k11ActiveId, setK11ActiveId] = useState<string | null>(null);
  const [k11Features, setK11Features] = useState<K11Features | null>(null);
  const [k11Result, setK11Result] = useState<DiagnoseResponse | null>(null);
  const [k11Loading, setK11Loading] = useState(false);
  const [k11Error, setK11Error] = useState<string | null>(null);

  // Carrega a lista de 107 gêneros K-11 uma vez (cache: no-store no client).
  useEffect(() => {
    let cancelled = false;
    fetchGeneros()
      .then((list) => {
        if (cancelled) return;
        setK11Genres(list);
        // Pré-seleciona "pop" se estiver disponível (default razoável).
        if (list.length > 0 && !selectedK11Genre) {
          setSelectedK11Genre(list.includes("pop") ? "pop" : list[0]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Falha ao listar gêneros K-11.";
        setK11GenresError(msg);
        // eslint-disable-next-line no-console
        console.error("[UploadAnalyzer] fetchGeneros falhou", err);
      });
    return () => {
      cancelled = true;
    };
    // selectedK11Genre é lido apenas no init — não queremos loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // as URLs ficam num ref porque a limpeza roda so no unmount, quando o estado
  // capturado no closure ja estaria desatualizado
  useEffect(() => {
    return () => {
      stopPlayback();
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current = [];
    };
  }, []);

  async function analyzeFile(file: File) {
    setPending(file.name);
    setError(null);

    if (file.size === 0) {
      setError(`"${file.name}" está vazio (0 bytes). Selecione um arquivo de áudio válido.`);
      setPending(null);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError(`"${file.name}" tem ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo 50 MB para análise no navegador.`);
      setPending(null);
      return;
    }

    try {
      const { buffer, monoSamples } = await decodeAudioFile(file);
      if (buffer.duration < 5) {
        setError(`"${file.name}" tem só ${buffer.duration.toFixed(1)}s. Mínimo de 5s para extrair features.`);
        return;
      }
      const metrics = analyzeChannel(buffer.getChannelData(0), buffer.duration);
      const { classification, descriptors, descriptorsError } = await analyzeSamples(monoSamples);
      const base = { fileName: file.name, durationMs: buffer.duration * 1000, ...metrics };
      const scored = buildUploadScore(base);
      const objectUrl = URL.createObjectURL(file);
      objectUrls.current.push(objectUrl);

      // Wave 3 — extrai as 11 features K-11 do mesmo buffer mono (sample rate
      // garantido em FEATURE_SAMPLE_RATE pelo `decodeAudioFile`).
      let k11FeaturesValue: K11Features | null = null;
      try {
        k11FeaturesValue = await extractK11Features(monoSamples, FEATURE_SAMPLE_RATE);
      } catch (k11Err) {
        // extractK11Features é projetada pra nunca lançar, mas defensivo.
        // eslint-disable-next-line no-console
        console.warn("[UploadAnalyzer] extractK11Features falhou", k11Err);
      }

      setResults((current) => [
        {
          id: `upload-${Date.now()}-${current.length}`,
          objectUrl,
          tempo: descriptors?.bpm ?? classification?.summary.tempo ?? 0,
          // abaixo de 5s a janela nao sustenta uma leitura de genero
          genres: classification && buffer.duration >= 5 ? classification.scores.slice(0, 3) : [],
          descriptors,
          descriptorsError,
          summary: classification?.summary ?? null,
          // K-11 — sem diagnóstico ainda, mas features já calculadas.
          k11Features: k11FeaturesValue,
          k11Result: null,
          k11Genero: null,
          ...base,
          ...scored,
        },
        ...current,
      ]);
    } catch {
      setError(`Não consegui ler "${file.name}". Tente enviar um MP3, WAV, M4A, OGG ou FLAC.`);
    } finally {
      setPending(null);
    }
  }

  async function analyzeFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      await analyzeFile(file);
    }
  }

  function clearResults() {
    stopPlayback();
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = [];
    setResults([]);
    setError(null);
    // Limpa também o estado K-11 ativo.
    setK11ActiveId(null);
    setK11Features(null);
    setK11Result(null);
    setK11Error(null);
    setK11Loading(false);
  }

  /**
   * Dispara o diagnóstico K-11 para um resultado específico. Atualiza o
   * estado ativo (componente) e também persiste resultado no `UploadResult`
   * correspondente — assim, ao rolar entre cards, cada um mantém o seu.
   */
  async function runK11Diagnose(result: UploadResult) {
    if (!result.k11Features) {
      setK11Error("Features K-11 não foram extraídas desta faixa (áudio pode ter falhado na decodificação).");
      return;
    }
    if (!selectedK11Genre) {
      setK11Error("Selecione um gênero K-11 antes de diagnosticar.");
      return;
    }

    setK11ActiveId(result.id);
    setK11Features(result.k11Features);
    setK11Result(null);
    setK11Error(null);
    setK11Loading(true);

    try {
      const resp = await k11Diagnose(result.k11Features.features, selectedK11Genre);
      setK11Result(resp);
      // Persiste no resultado para sobreviver a re-renders / scroll.
      setResults((current) =>
        current.map((r) =>
          r.id === result.id
            ? { ...r, k11Result: resp, k11Genero: selectedK11Genre }
            : r,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha desconhecida no diagnóstico K-11.";
      setK11Error(msg);
      // Persiste o erro também no card correspondente.
      setResults((current) =>
        current.map((r) =>
          r.id === result.id ? { ...r, k11Result: null, k11Genero: selectedK11Genre } : r,
        ),
      );
      // eslint-disable-next-line no-console
      console.error("[UploadAnalyzer] k11Diagnose falhou", err);
    } finally {
      setK11Loading(false);
    }
  }

  return (
    <section className="panel upload-panel">
      <div className="section-heading">
        <p>Upload</p>
        <h2>Enviar e classificar música</h2>
      </div>

      <div
        className={`upload-dropzone ${isDragging ? "is-dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (event.dataTransfer.files.length) void analyzeFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/flac"
          onChange={(event) => {
            const files = event.target.files;
            if (files?.length) void analyzeFiles(files);
            event.target.value = "";
          }}
        />
        <span>Arraste ou selecione seus áudios</span>
        <strong>MP3, WAV, M4A, OGG ou FLAC · várias de uma vez</strong>
      </div>

      <p className="upload-note">
        Gêneros reconhecidos pelo classificador GTZAN: {MODEL.genres.join(", ")} — os {MODEL.genres.length} do {MODEL.source},
        com {Math.round(MODEL.accuracy * 100)}% de acurácia em validação cruzada contra {Math.round(MODEL.baseline * 100)}%
        do acaso. O conjunto é norte-americano e <strong>não cobre gêneros brasileiros</strong> (sertanejo, MPB, funk, pagode,
        samba, forró caem em aproximações como country, jazz, hip-hop). <strong>Para diagnóstico em gêneros
        brasileiros, use o botão &ldquo;Diagnosticar com K-11&rdquo; abaixo</strong> — o K-11 cobre 107 gêneros incluindo
        sertanejo, mpb, funk, pagode, samba, forro, brazil. Tom, BPM, dançabilidade e loudness vêm da Essentia
        em WebAssembly. Tudo roda no seu navegador: nenhum áudio é enviado para servidor.
      </p>

      {pending ? <p className="insight-loading">Analisando &ldquo;{pending}&rdquo;: espectro, ritmo e dinâmica...</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      {results.length > 0 ? (
        <div className="upload-results">
          <button type="button" className="upload-clear" onClick={clearResults}>
            Limpar {results.length} análise{results.length > 1 ? "s" : ""}
          </button>

          {results.map((result) => {
            // Estado K-11 efetivo: prioriza o que está persistido no
            // resultado; cai pro estado "ativo" se o usuário acabou de
            // clicar neste card.
            const isActive = k11ActiveId === result.id;
            const effectiveFeatures = isActive ? k11Features : result.k11Features;
            const effectiveResult = isActive ? k11Result : result.k11Result;
            const effectiveError = isActive ? k11Error : null;
            const effectiveLoading = isActive && k11Loading;
            return (
              <div className="upload-result" key={result.id}>
                <div className={`upload-score ${result.tone}`}>
                  <span>{result.score}</span>
                  <strong>{result.label}</strong>
                  <small>{result.fileName}</small>
                </div>

                <PreviewPlayer
                  sourceId={result.id}
                  url={result.objectUrl}
                  title={result.fileName}
                  caption="Sua faixa, tocada localmente"
                />

                {result.genres.length > 0 ? (
                  <div className="genre-result">
                    <p className="album-label">Gênero provável</p>
                    {result.genres.map((genre, index) => (
                      <div className={`genre-bar ${index === 0 ? "is-top" : ""}`} key={genre.genre}>
                        <span>{genre.label}</span>
                        <div>
                          <i style={{ width: `${Math.round(genre.probability * 100)}%` }} />
                        </div>
                        <strong>{Math.round(genre.probability * 100)}%</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="upload-note">Áudio curto demais (menos de 5s) para classificar o gênero.</p>
                )}

                <SoundFeatureGrid
                  groups={buildSoundFeatures({
                    summary: result.summary,
                    descriptors: result.descriptors,
                    durationMs: result.durationMs,
                    clippedSamples: result.clippedSamples,
                  })}
                />

                {result.descriptors ? null : (
                  <p className="upload-note">
                    Descritores da Essentia (tom, BPM, dançabilidade) indisponíveis
                    {result.descriptorsError ? ` (${result.descriptorsError})` : ""} — a leitura acima usa só o DSP
                    próprio.
                  </p>
                )}

                <div className="signal-list">
                  {result.signals.map((signal) => (
                    <p key={signal}>{signal}</p>
                  ))}
                </div>

                {/* Wave 3 — bloco K-11. Aditivo: aparece abaixo dos signals,
                    sem mexer na ordem visual dos componentes existentes. */}
                {effectiveFeatures ? (
                  <div className="k11-block" data-testid={`k11-block-${result.id}`}>
                    <div className="album-label" style={{ marginTop: 8 }}>
                      <span>Diagnóstico K-11</span>
                      {result.k11Genero ? (
                        <small style={{ color: "var(--muted)" }}>
                          · gênero: <code>{result.k11Genero}</code>
                        </small>
                      ) : null}
                    </div>

                    <FeatureOriginChips
                      origin={effectiveFeatures.origin}
                      confidence={effectiveFeatures.confidence}
                    />

                    <div className="k11-controls" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <label htmlFor={`k11-genre-${result.id}`} className="upload-note" style={{ margin: 0 }}>
                        Gênero K-11 (override):
                      </label>
                      <select
                        id={`k11-genre-${result.id}`}
                        className="k11-genre-select"
                        value={selectedK11Genre}
                        onChange={(event) => setSelectedK11Genre(event.target.value)}
                        disabled={k11Genres.length === 0 || effectiveLoading}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--line)",
                          background: "var(--panel-2)",
                          color: "inherit",
                          minWidth: 160,
                          maxWidth: 240,
                        }}
                      >
                        {k11Genres.length === 0 ? (
                          <option value="">{k11GenresError ? "Falha ao carregar" : "carregando..."}</option>
                        ) : (
                          k11Genres.map((genre) => (
                            <option key={genre} value={genre}>
                              {genre}
                            </option>
                          ))
                        )}
                      </select>

                      <button
                        type="button"
                        className="scan-button"
                        onClick={() => void runK11Diagnose(result)}
                        disabled={effectiveLoading || k11Genres.length === 0 || !selectedK11Genre}
                        title={
                          k11Genres.length === 0
                            ? "Lista de gêneros K-11 indisponível"
                            : !selectedK11Genre
                              ? "Selecione um gênero K-11"
                              : "Rodar diagnóstico Bayesiano"
                        }
                      >
                        {effectiveLoading ? "Diagnosticando..." : "Diagnosticar com K-11"}
                      </button>
                    </div>

                    {k11GenresError ? (
                      <p className="error-banner" role="alert">
                        Não foi possível listar os 107 gêneros K-11: {k11GenresError}. O diagnóstico fica
                        desabilitado até a lista carregar.
                      </p>
                    ) : null}

                    <K11DiagnoseCard
                      result={effectiveResult}
                      isLoading={effectiveLoading}
                      error={effectiveError}
                      features={effectiveFeatures}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
