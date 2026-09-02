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
};

type ScanResult = {
  genres: GenreScore[];
  descriptors: EssentiaDescriptors | null;
  summary: AudioSummary | null;
  durationMs: number;
  descriptorsError?: string;
};

export function TrackScanner({ trackId, trackName }: TrackScannerProps) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // a analise dispara sozinha ao selecionar a faixa; trocar de musica no meio
  // aborta o download e descarta o resultado que estiver a caminho
  useEffect(() => {
    const controller = new AbortController();
    void scan(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  async function scan(signal?: AbortSignal) {
    setResult(null);
    setIsScanning(true);
    setError(null);

    try {
      const response = await fetch(`/api/preview/${trackId}`, { signal });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Não consegui carregar o áudio desta faixa.");
      }

      const { buffer, monoSamples } = await decodeAudioData(await response.arrayBuffer());
      const analysis = await analyzeSamples(monoSamples);

      if (signal?.aborted) return;

      setResult({
        genres: analysis.classification ? analysis.classification.scores.slice(0, 3) : [],
        descriptors: analysis.descriptors,
        summary: analysis.classification?.summary ?? null,
        durationMs: buffer.duration * 1000,
        descriptorsError: analysis.descriptorsError,
      });
    } catch (scanError) {
      if (signal?.aborted) return;
      setError(scanError instanceof Error ? scanError.message : "Falha ao escanear o áudio.");
    } finally {
      if (!signal?.aborted) setIsScanning(false);
    }
  }

  // o botao aparece sempre: quando o servidor ainda nao confirmou a previa, o
  // clique refaz a busca. Esconder o botao fazia uma falha de rede passageira
  // parecer ausencia definitiva de audio.
  const rotulo = isScanning ? "Analisando áudio..." : result ? "Analisar de novo" : "Analisar áudio da faixa";

  return (
    <div className="scan-block">
      <button type="button" className="scan-button" onClick={() => void scan()} disabled={isScanning}>
        {rotulo}
      </button>

      {error ? (
        <>
          <p className="error-banner">{error}</p>
          <p className="feature-note">
            Se a busca falhou por rede, clicar de novo costuma resolver — nada de falha fica em cache. Se a faixa
            realmente não tem prévia em nenhum catálogo, envie o arquivo no painel de upload.
          </p>
        </>
      ) : null}

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

      {result?.descriptorsError ? (
        <p className="feature-note">
          Descritores da Essentia indisponíveis ({result.descriptorsError}); a leitura abaixo usa só o DSP próprio.
        </p>
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
