// Extrai as features do GTZAN com o MESMO codigo TypeScript que roda no browser.
// Treinar sobre estas features (e nao sobre as do librosa) elimina qualquer
// diferenca entre treino e inferencia.
//
//   node --experimental-strip-types scripts/ts/extrair_gtzan.mts

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { FEATURE_NAMES, FEATURE_SAMPLE_RATE, extractFeatures } from "../../src/lib/audio-features.ts";

const RAIZ = new URL("../../", import.meta.url).pathname;
const AUDIO = join(RAIZ, "data/gtzan/genres");
const SAIDA = join(RAIZ, "data/processed/gtzan_features_web.csv");

function lerWav(caminho: string) {
  const buffer = readFileSync(caminho);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${caminho}: nao e um WAV RIFF`);
  }

  let offset = 12;
  let channels = 1;
  let sampleRate = FEATURE_SAMPLE_RATE;
  let bitsPerSample = 16;
  let data: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === "fmt ") {
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (id === "data") {
      data = buffer.subarray(body, Math.min(body + size, buffer.length));
    }

    offset = body + size + (size % 2);
  }

  if (!data) throw new Error(`${caminho}: chunk data ausente`);
  if (bitsPerSample !== 16) throw new Error(`${caminho}: esperado PCM 16 bits, veio ${bitsPerSample}`);

  const total = Math.floor(data.length / 2 / channels);
  const samples = new Float32Array(total);
  for (let index = 0; index < total; index += 1) {
    let soma = 0;
    for (let canal = 0; canal < channels; canal += 1) {
      soma += data.readInt16LE((index * channels + canal) * 2) / 32768;
    }
    samples[index] = soma / channels;
  }

  return { samples, sampleRate };
}

function reamostrar(samples: Float32Array, origem: number) {
  if (origem === FEATURE_SAMPLE_RATE) return samples;
  const razao = FEATURE_SAMPLE_RATE / origem;
  const destino = new Float32Array(Math.floor(samples.length * razao));
  for (let index = 0; index < destino.length; index += 1) {
    const posicao = index / razao;
    const base = Math.floor(posicao);
    const peso = posicao - base;
    destino[index] = (samples[base] ?? 0) * (1 - peso) + (samples[base + 1] ?? 0) * peso;
  }
  return destino;
}

const generos = readdirSync(AUDIO).filter((nome) => statSync(join(AUDIO, nome)).isDirectory()).sort();
const linhas: string[] = [["arquivo", "genero", ...FEATURE_NAMES].join(",")];
const inicio = Date.now();
let processados = 0;
let falhas = 0;

for (const genero of generos) {
  const pasta = join(AUDIO, genero);
  for (const arquivo of readdirSync(pasta).filter((nome) => nome.endsWith(".wav")).sort()) {
    try {
      const { samples, sampleRate } = lerWav(join(pasta, arquivo));
      const { vector } = extractFeatures(reamostrar(samples, sampleRate));
      linhas.push([basename(arquivo), genero, ...vector.map((valor) => valor.toFixed(6))].join(","));
    } catch (erro) {
      falhas += 1;
      console.warn(`  falha em ${arquivo}: ${(erro as Error).message}`);
    }

    processados += 1;
    if (processados % 100 === 0) {
      const seg = (Date.now() - inicio) / 1000;
      console.log(`  ${processados} clipes (${(processados / seg).toFixed(1)}/s)`);
    }
  }
}

writeFileSync(SAIDA, linhas.join("\n") + "\n");
console.log(`\ngravado ${SAIDA} (${linhas.length - 1} clipes x ${FEATURE_NAMES.length} features, ${falhas} falhas)`);
