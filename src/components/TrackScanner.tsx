"use client";

import { useEffect, useState } from "react";
import { analyzeSamples } from "@/lib/audio-analysis";
import { decodeAudioData } from "@/lib/audio-decode";
import type { AudioSummary } from "@/lib/audio-features";
import type { EssentiaDescriptors } from "@/lib/essentia-analysis";
import type { GenreScore } from "@/lib/genre-classifier";
import { buildSoundFeatures } from "@/lib/sound-features";
import { SoundFeatureGrid } from "./SoundFeatureGrid";

type TrackScannerProps = {
  trackId: string;
  trackName: string;
  hasAudio: boolean;
};

type ScanResult = {
  genres: GenreScore[];
  descriptors: EssentiaDescriptors | null;
  summary: AudioSummary | null;
  durationMs: number;
};

export function TrackScanner({ trackId, trackName, hasAudio }: TrackScannerProps) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [trackId]);

  async function scan() {
    setIsScanning(true);
    setError(null);

    try {
      const response = await fetch(`/api/preview/${trackId}`);

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Não consegui carregar o áudio desta faixa.");
      }

      const { buffer, monoSamples } = await decodeAudioData(await response.arrayBuffer());
      const analysis = await analyzeSamples(monoSamples);

      setResult({
        genres: analysis.classification ? analysis.classification.scores.slice(0, 3) : [],
        descriptors: analysis.descriptors,
        summary: analysis.classification?.summary ?? null,
        durationMs: buffer.duration * 1000,
      });
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Falha ao escanear o áudio.");
    } finally {
      setIsScanning(false);
    }
  }

  // sem fonte de audio nao ha o que escanear: a API do Spotify parou de
  // devolver preview_url e nem toda faixa tem previa publica equivalente
  if (!hasAudio) {
    return (
      <p className="upload-note">
        Esta faixa não tem prévia de áudio disponível, então só dá para avaliá-la pelos metadados acima. Para uma
        leitura do áudio (gênero, tom, BPM), envie o arquivo no painel de upload.
      </p>
    );
  }

  return (
    <div className="scan-block">
      <button type="button" className="scan-button" onClick={() => void scan()} disabled={isScanning}>
        {isScanning ? "Escaneando áudio..." : "Escanear áudio da faixa"}
      </button>

      {error ? <p className="error-banner">{error}</p> : null}

      {result ? (
        <div className="genre-result">
          <p className="album-label">Leitura do áudio de {trackName}</p>

          {result.genres.map((genre, index) => (
            <div className={`genre-bar ${index === 0 ? "is-top" : ""}`} key={genre.genre}>
              <span>{genre.label}</span>
              <div>
                <i style={{ width: `${Math.round(genre.probability * 100)}%` }} />
              </div>
              <strong>{Math.round(genre.probability * 100)}%</strong>
            </div>
          ))}

          <p className="feature-note">
            Rótulos do GTZAN, catálogo norte-americano de 10 gêneros: uma faixa de sertanejo tende a aparecer aqui
            como country.
          </p>
        </div>
      ) : null}

      {result ? (
        <SoundFeatureGrid
          groups={buildSoundFeatures({
            summary: result.summary,
            descriptors: result.descriptors,
            durationMs: result.durationMs,
          })}
        />
      ) : null}
    </div>
  );
}
