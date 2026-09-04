"use client";

// As duas formas de entrar no app (arquivo do aparelho ou música do Spotify)
// terminam no mesmo objeto `Musica`. Assim existe uma única tela de resultado,
// e quem usa não precisa aprender duas interfaces diferentes.
import { analyzeSamples } from "./audio-analysis";
import { decodeAudioData, decodeAudioFile } from "./audio-decode";
import type { EssentiaDescriptors } from "./essentia-analysis";
import { genreLabel } from "./genre-classifier";
import { durationLabel } from "./insights";
import { modelGenreFor, toModelFeatures } from "./model-bridge";
import type { TrackFeatures } from "./model/types";
import { buildSoundFeatures, type SoundFeatureGroup } from "./sound-features";

const TOM_PT: Record<string, string> = { major: "maior", minor: "menor" };

export type EtapaAnalise = "abrindo" | "ouvindo" | "estilo" | "modelo";

export type Sugestao = {
  valor: string;
  rotulo: string;
  nota?: string;
};

export type Musica = {
  id: string;
  titulo: string;
  subtitulo: string;
  capa?: string;
  audioUrl?: string;
  legendaAudio?: string;
  linkSpotify?: string;
  duracaoMs: number;
  /** dados curtos da faixa, mostrados como uma linha discreta sob o nome */
  detalhes: string[];
  features: TrackFeatures;
  generoInicial: string;
  sugestoes: Sugestao[];
  medidas: SoundFeatureGroup[];
  /** aviso curto quando alguma medida saiu aproximada */
  aviso?: string;
};

export class ErroAmigavel extends Error {}

function medirPicos(canal: Float32Array) {
  const passo = Math.max(1, Math.floor(canal.length / 220_000));
  let pico = 0;
  let clipadas = 0;

  for (let indice = 0; indice < canal.length; indice += passo) {
    const absoluto = Math.abs(canal[indice]);
    if (absoluto > pico) pico = absoluto;
    if (absoluto >= 0.98) clipadas += 1;
  }

  return { pico, clipadas };
}

type Bruto = {
  duracaoSegundos: number;
  pico: number;
  clipadas: number;
  monoSamples: Float32Array;
};

async function medir(dados: ArrayBuffer, avisar: (etapa: EtapaAnalise) => void): Promise<Bruto> {
  const { buffer, monoSamples } = await decodeAudioData(dados);
  avisar("ouvindo");
  const { pico, clipadas } = medirPicos(buffer.getChannelData(0));
  return { duracaoSegundos: buffer.duration, pico, clipadas, monoSamples };
}

async function montar(
  bruto: Bruto,
  avisar: (etapa: EtapaAnalise) => void,
  explicito: boolean,
  rotuloDuracao?: string,
) {
  const { classification, descriptors, descriptorsError } = await analyzeSamples(bruto.monoSamples);
  avisar("estilo");

  const summary = classification?.summary ?? null;
  const features = toModelFeatures({ summary, descriptors, explicit: explicito ? 1 : 0 });

  if (!features) {
    throw new ErroAmigavel("Não consegui escutar esse áudio. Tente outra música.");
  }

  const escutados = classification && bruto.duracaoSegundos >= 5 ? classification.scores.slice(0, 3) : [];

  avisar("modelo");

  return {
    descriptors,
    features,
    generoSugerido: modelGenreFor(escutados[0]?.genre),
    sugestoesDoSom: escutados.map((item) => ({
      valor: modelGenreFor(item.genre),
      rotulo: genreLabel(item.genre),
      nota: `${Math.round(item.probability * 100)}%`,
    })),
    medidas: buildSoundFeatures({
      summary: summary ? { ...summary, peak: bruto.pico } : null,
      descriptors,
      durationMs: bruto.duracaoSegundos * 1000,
      clippedSamples: bruto.clipadas,
      rotuloDuracao,
    }),
    aviso: descriptors
      ? undefined
      : "Não deu para carregar a parte que mede ritmo e tom, então o andamento e o tom estão aproximados.",
  };
}

export async function analisarArquivo(
  arquivo: File,
  avisar: (etapa: EtapaAnalise) => void,
): Promise<Musica> {
  avisar("abrindo");

  let bruto: Bruto;
  try {
    const { buffer, monoSamples } = await decodeAudioFile(arquivo);
    avisar("ouvindo");
    const { pico, clipadas } = medirPicos(buffer.getChannelData(0));
    bruto = { duracaoSegundos: buffer.duration, pico, clipadas, monoSamples };
  } catch {
    throw new ErroAmigavel(
      `Não consegui abrir "${arquivo.name}". Vale tentar um arquivo MP3, WAV, M4A, OGG ou FLAC.`,
    );
  }

  const leitura = await montar(bruto, avisar, false);

  return {
    id: `arquivo-${Date.now()}`,
    titulo: arquivo.name.replace(/\.[^.]+$/, ""),
    subtitulo: "Arquivo do seu aparelho",
    audioUrl: URL.createObjectURL(arquivo),
    legendaAudio: "Tocando do seu aparelho",
    duracaoMs: bruto.duracaoSegundos * 1000,
    detalhes: montarDetalhes(bruto.duracaoSegundos * 1000, leitura.descriptors),
    ...leitura,
    generoInicial: leitura.generoSugerido,
    sugestoes: leitura.sugestoesDoSom,
  };
}

// Poucos dados, e so os que qualquer pessoa entende de bate-pronto. O resto
// continua no bloco "o que foi medido no som", que abre sob demanda.
function montarDetalhes(
  duracaoMs: number,
  descriptors: EssentiaDescriptors | null,
  lancamento?: string,
) {
  const partes: string[] = [];

  const ano = lancamento?.slice(0, 4);
  if (ano && /^\d{4}$/.test(ano)) partes.push(ano);

  partes.push(durationLabel(duracaoMs));

  if (descriptors) {
    partes.push(`${Math.round(descriptors.bpm)} bpm`);
    partes.push(`${descriptors.key} ${TOM_PT[descriptors.scale] || descriptors.scale}`);
  }

  return partes;
}

type FaixaSpotify = {
  id: string;
  name: string;
  explicit: boolean;
  duration_ms: number;
  external_urls: { spotify: string };
  artists: { name: string }[];
  album: { name: string; release_date?: string; images: { url: string }[] };
};

export async function analisarFaixa(
  faixa: FaixaSpotify,
  generoBusca: string,
  avisar: (etapa: EtapaAnalise) => void,
  signal?: AbortSignal,
): Promise<Musica> {
  avisar("abrindo");

  const resposta = await fetch(`/api/preview/${faixa.id}`, { signal });
  if (!resposta.ok) {
    throw new ErroAmigavel("Não achei um trecho dessa música para escutar. Tente outra da lista.");
  }

  const bruto = await medir(await resposta.arrayBuffer(), avisar);
  const leitura = await montar(bruto, avisar, faixa.explicit, "Trecho analisado");

  // O estilo que a pessoa escolheu na busca vale mais que o palpite do
  // classificador: foi uma escolha explícita dela.
  const sugestoes: Sugestao[] = [
    { valor: generoBusca, rotulo: generoBusca, nota: "sua busca" },
    ...leitura.sugestoesDoSom.filter((item) => item.valor !== generoBusca),
  ];

  return {
    id: faixa.id,
    titulo: faixa.name,
    subtitulo: faixa.artists.map((artista) => artista.name).join(", "),
    capa: faixa.album.images[1]?.url || faixa.album.images[0]?.url,
    audioUrl: `/api/preview/${faixa.id}`,
    legendaAudio: "Trecho de 30 segundos",
    linkSpotify: faixa.external_urls.spotify,
    duracaoMs: faixa.duration_ms,
    detalhes: montarDetalhes(faixa.duration_ms, leitura.descriptors, faixa.album.release_date),
    ...leitura,
    generoInicial: generoBusca || leitura.generoSugerido,
    sugestoes,
  };
}
