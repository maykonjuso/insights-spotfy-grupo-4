import { FEATURE_SAMPLE_RATE } from "./audio-features";

export type DecodedAudio = {
  buffer: AudioBuffer;
  monoSamples: Float32Array;
};

// O navegador decodifica na taxa nativa (44,1 kHz em geral); o modelo foi
// treinado em 22,05 kHz mono, entao a reamostragem sai do OfflineAudioContext.
export async function decodeAudioData(data: ArrayBuffer): Promise<DecodedAudio> {
  const context = new AudioContext();
  let buffer: AudioBuffer;

  try {
    buffer = await context.decodeAudioData(data);
  } finally {
    await context.close();
  }

  const frames = Math.max(1, Math.ceil(buffer.duration * FEATURE_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frames, FEATURE_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();

  return { buffer, monoSamples: rendered.getChannelData(0) };
}

export async function decodeAudioFile(file: File): Promise<DecodedAudio> {
  return decodeAudioData(await file.arrayBuffer());
}
