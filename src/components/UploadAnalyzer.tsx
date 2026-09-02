"use client";

import { useEffect, useRef, useState } from "react";
import { analyzeSamples } from "@/lib/audio-analysis";
import { decodeAudioFile } from "@/lib/audio-decode";
import type { AudioSummary } from "@/lib/audio-features";
import type { EssentiaDescriptors } from "@/lib/essentia-analysis";
import { modelInfo, type GenreScore } from "@/lib/genre-classifier";
import { durationLabel } from "@/lib/insights";
import { stopPlayback } from "@/lib/preview-player";
import { buildSoundFeatures } from "@/lib/sound-features";
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

    try {
      const { buffer, monoSamples } = await decodeAudioFile(file);
      const metrics = analyzeChannel(buffer.getChannelData(0), buffer.duration);
      const { classification, descriptors, descriptorsError } = await analyzeSamples(monoSamples);
      const base = { fileName: file.name, durationMs: buffer.duration * 1000, ...metrics };
      const scored = buildUploadScore(base);
      const objectUrl = URL.createObjectURL(file);
      objectUrls.current.push(objectUrl);

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
        Gêneros reconhecidos: {MODEL.genres.join(", ")} — os {MODEL.genres.length} do {MODEL.source}, com{" "}
        {Math.round(MODEL.accuracy * 100)}% de acurácia em validação cruzada contra {Math.round(MODEL.baseline * 100)}%
        do acaso. O conjunto é norte-americano e não tem gêneros brasileiros: sertanejo cai em country, MPB costuma
        cair em jazz ou blues e funk em hip-hop. Tom, BPM, dançabilidade e loudness vêm da Essentia em WebAssembly.
        Tudo roda no seu navegador: nenhum áudio é enviado para servidor.
      </p>

      {pending ? <p className="insight-loading">Analisando &ldquo;{pending}&rdquo;: espectro, ritmo e dinâmica...</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      {results.length > 0 ? (
        <div className="upload-results">
          <button type="button" className="upload-clear" onClick={clearResults}>
            Limpar {results.length} análise{results.length > 1 ? "s" : ""}
          </button>

          {results.map((result) => (
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
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
