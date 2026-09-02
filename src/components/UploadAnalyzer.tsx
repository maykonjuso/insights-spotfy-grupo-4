"use client";

import { useRef, useState } from "react";
import { durationLabel } from "@/lib/insights";

type UploadResult = {
  fileName: string;
  score: number;
  label: string;
  tone: "low" | "mid" | "high";
  durationMs: number;
  energy: number;
  loudnessDb: number;
  dynamicRange: number;
  peak: number;
  clippedSamples: number;
  signals: string[];
};

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

function buildUploadScore(result: Omit<UploadResult, "score" | "label" | "tone" | "signals">) {
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
  const [result, setResult] = useState<UploadResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyzeFile(file: File) {
    setIsAnalyzing(true);
    setError(null);

    try {
      const audioContext = new AudioContext();
      const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());
      await audioContext.close();
      const channel = buffer.getChannelData(0);
      const metrics = analyzeChannel(channel, buffer.duration);
      const baseResult = {
        fileName: file.name,
        durationMs: buffer.duration * 1000,
        ...metrics,
      };
      const scored = buildUploadScore(baseResult);

      setResult({
        ...baseResult,
        ...scored,
      });
    } catch {
      setError("Não consegui ler esse arquivo. Tente enviar um MP3, WAV, M4A ou OGG.");
      setResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <section className="panel upload-panel">
      <div className="section-heading">
        <p>Upload</p>
        <h2>Analisar música inédita</h2>
      </div>

      <div className="upload-dropzone" onClick={() => inputRef.current?.click()}>
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/flac"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void analyzeFile(file);
          }}
        />
        <span>Enviar arquivo de áudio</span>
        <strong>MP3, WAV, M4A, OGG ou FLAC</strong>
      </div>

      {isAnalyzing ? <p className="insight-loading">Analisando energia, duração e dinâmica da música...</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      {result ? (
        <div className="upload-result">
          <div className={`upload-score ${result.tone}`}>
            <span>{result.score}</span>
            <strong>{result.label}</strong>
            <small>{result.fileName}</small>
          </div>

          <div className="metrics-grid">
            <div>
              <span>Duração</span>
              <strong>{durationLabel(result.durationMs)}</strong>
            </div>
            <div>
              <span>Energia</span>
              <strong>{metricPercent(result.energy)}</strong>
            </div>
            <div>
              <span>Loudness</span>
              <strong>{db(result.loudnessDb)}</strong>
            </div>
            <div>
              <span>Dinâmica</span>
              <strong>{metricPercent(result.dynamicRange)}</strong>
            </div>
            <div>
              <span>Pico</span>
              <strong>{metricPercent(result.peak)}</strong>
            </div>
            <div>
              <span>Clipping</span>
              <strong>{result.clippedSamples}</strong>
            </div>
          </div>

          <div className="signal-list">
            {result.signals.map((signal) => (
              <p key={signal}>{signal}</p>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
