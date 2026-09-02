export const FEATURE_SAMPLE_RATE = 22050;
export const WINDOW_SECONDS = 30;

const FRAME = 2048;
const HOP = 512;
const MEL_BANDS = 40;
const MFCC_COUNT = 20;
const CONTRAST_EDGES = [0, 200, 400, 800, 1600, 3200, 6400, FEATURE_SAMPLE_RATE / 2];
const EPS = 1e-10;

export type AudioSummary = {
  tempo: number;
  centroid: number;
  rolloff: number;
  bandwidth: number;
  zcr: number;
  rms: number;
  peak: number;
  contrastMean: number;
  flatness: number;
};

export type FeatureResult = {
  vector: number[];
  summary: AudioSummary;
};

function hannWindow(size: number) {
  const window = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / size);
  }
  return window;
}

function createFft(size: number) {
  const levels = Math.round(Math.log2(size));
  const cos = new Float64Array(size / 2);
  const sin = new Float64Array(size / 2);
  const reversed = new Uint32Array(size);

  for (let index = 0; index < size / 2; index += 1) {
    cos[index] = Math.cos((2 * Math.PI * index) / size);
    sin[index] = Math.sin((2 * Math.PI * index) / size);
  }

  for (let index = 0; index < size; index += 1) {
    let value = index;
    let reversedValue = 0;
    for (let bit = 0; bit < levels; bit += 1) {
      reversedValue = (reversedValue << 1) | (value & 1);
      value >>= 1;
    }
    reversed[index] = reversedValue;
  }

  return function fft(real: Float64Array, imag: Float64Array) {
    for (let index = 0; index < size; index += 1) {
      const target = reversed[index];
      if (target > index) {
        let swap = real[index];
        real[index] = real[target];
        real[target] = swap;
        swap = imag[index];
        imag[index] = imag[target];
        imag[target] = swap;
      }
    }

    for (let length = 2; length <= size; length <<= 1) {
      const half = length >> 1;
      const step = size / length;
      for (let start = 0; start < size; start += length) {
        for (let offset = 0, twiddle = 0; offset < half; offset += 1, twiddle += step) {
          const re = cos[twiddle];
          const im = -sin[twiddle];
          const evenIndex = start + offset;
          const oddIndex = evenIndex + half;
          const oddRe = real[oddIndex];
          const oddIm = imag[oddIndex];
          const productRe = oddRe * re - oddIm * im;
          const productIm = oddRe * im + oddIm * re;
          real[oddIndex] = real[evenIndex] - productRe;
          imag[oddIndex] = imag[evenIndex] - productIm;
          real[evenIndex] += productRe;
          imag[evenIndex] += productIm;
        }
      }
    }
  };
}

function hzToMel(hz: number) {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number) {
  return 700 * (10 ** (mel / 2595) - 1);
}

function createMelBank(bins: number, sampleRate: number) {
  const nyquist = sampleRate / 2;
  const points: number[] = [];
  const lowMel = hzToMel(30);
  const highMel = hzToMel(nyquist);

  for (let index = 0; index < MEL_BANDS + 2; index += 1) {
    const mel = lowMel + ((highMel - lowMel) * index) / (MEL_BANDS + 1);
    points.push((melToHz(mel) / nyquist) * (bins - 1));
  }

  return Array.from({ length: MEL_BANDS }, (_, band) => {
    const left = points[band];
    const center = points[band + 1];
    const right = points[band + 2];
    const weights: { bin: number; weight: number }[] = [];

    for (let bin = Math.floor(left); bin <= Math.ceil(right) && bin < bins; bin += 1) {
      if (bin < 0) continue;
      const weight =
        bin <= center
          ? (bin - left) / Math.max(center - left, EPS)
          : (right - bin) / Math.max(right - center, EPS);
      if (weight > 0) weights.push({ bin, weight });
    }

    return weights;
  });
}

function createDctMatrix(outputs: number, inputs: number) {
  const matrix: Float64Array[] = [];
  const scale = Math.sqrt(2 / inputs);

  for (let out = 0; out < outputs; out += 1) {
    const row = new Float64Array(inputs);
    const norm = out === 0 ? Math.sqrt(1 / inputs) : scale;
    for (let input = 0; input < inputs; input += 1) {
      row[input] = norm * Math.cos((Math.PI * out * (2 * input + 1)) / (2 * inputs));
    }
    matrix.push(row);
  }

  return matrix;
}

function mean(values: ArrayLike<number>) {
  if (values.length === 0) return 0;
  let total = 0;
  for (let index = 0; index < values.length; index += 1) total += values[index];
  return total / values.length;
}

function std(values: ArrayLike<number>) {
  if (values.length === 0) return 0;
  const average = mean(values);
  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    const delta = values[index] - average;
    total += delta * delta;
  }
  return Math.sqrt(total / values.length);
}

export const FEATURE_NAMES: string[] = (() => {
  const names: string[] = [];
  for (let index = 0; index < MFCC_COUNT; index += 1) {
    names.push(`mfcc${String(index).padStart(2, "0")}_media`);
    names.push(`mfcc${String(index).padStart(2, "0")}_dp`);
  }
  for (let index = 0; index < 12; index += 1) {
    names.push(`chroma${String(index).padStart(2, "0")}`);
  }
  for (let index = 0; index < CONTRAST_EDGES.length - 1; index += 1) {
    names.push(`contraste${index}`);
  }
  for (const scalar of ["centroide", "rolloff", "largura", "zcr", "rms"]) {
    names.push(`${scalar}_media`);
    names.push(`${scalar}_dp`);
  }
  names.push("tempo");
  return names;
})();

const fft = createFft(FRAME);
const window = hannWindow(FRAME);
const binCount = FRAME / 2 + 1;
const melBank = createMelBank(binCount, FEATURE_SAMPLE_RATE);
const dct = createDctMatrix(MFCC_COUNT, MEL_BANDS);
const binFrequencies = Float64Array.from({ length: binCount }, (_, bin) => (bin * FEATURE_SAMPLE_RATE) / FRAME);
const pitchClasses = Int8Array.from(binFrequencies, (frequency) => {
  if (frequency < 40 || frequency > 5000) return -1;
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  return ((midi % 12) + 12) % 12;
});
const contrastBands = CONTRAST_EDGES.slice(0, -1).map((low, index) => {
  const high = CONTRAST_EDGES[index + 1];
  const bins: number[] = [];
  for (let bin = 0; bin < binCount; bin += 1) {
    if (binFrequencies[bin] >= low && binFrequencies[bin] < high) bins.push(bin);
  }
  return bins.length > 0 ? bins : [Math.min(binCount - 1, Math.max(1, Math.round(low / (FEATURE_SAMPLE_RATE / FRAME))))];
});

function estimateTempo(onsetEnvelope: number[]) {
  if (onsetEnvelope.length < 32) return 0;

  const average = mean(onsetEnvelope);
  const centered = onsetEnvelope.map((value) => value - average);
  const framesPerSecond = FEATURE_SAMPLE_RATE / HOP;
  const minLag = Math.max(2, Math.floor((60 / 220) * framesPerSecond));
  const maxLag = Math.min(centered.length - 1, Math.ceil((60 / 40) * framesPerSecond));

  let bestLag = 0;
  let bestScore = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    for (let index = 0; index + lag < centered.length; index += 1) {
      correlation += centered[index] * centered[index + lag];
    }
    correlation /= centered.length - lag;

    const bpm = (60 * framesPerSecond) / lag;
    const prior = Math.exp(-0.5 * ((Math.log2(bpm / 120) / 1) ** 2));
    const score = correlation * prior;

    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  return bestLag > 0 ? (60 * framesPerSecond) / bestLag : 0;
}

export function extractFeatures(samples: Float32Array): FeatureResult {
  const frameCount = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  if (frameCount < 4) {
    return {
      vector: FEATURE_NAMES.map(() => 0),
      summary: {
        tempo: 0,
        centroid: 0,
        rolloff: 0,
        bandwidth: 0,
        zcr: 0,
        rms: 0,
        peak: 0,
        contrastMean: 0,
        flatness: 0,
      },
    };
  }

  const mfccFrames: Float64Array[] = Array.from({ length: MFCC_COUNT }, () => new Float64Array(frameCount));
  const chromaTotals = new Float64Array(12);
  const contrastTotals = new Float64Array(contrastBands.length);
  const centroids = new Float64Array(frameCount);
  const rolloffs = new Float64Array(frameCount);
  const bandwidths = new Float64Array(frameCount);
  const zcrs = new Float64Array(frameCount);
  const rmsValues = new Float64Array(frameCount);
  const flatnessValues = new Float64Array(frameCount);
  const onsetEnvelope: number[] = [];
  let peak = 0;

  const real = new Float64Array(FRAME);
  const imag = new Float64Array(FRAME);
  const magnitude = new Float64Array(binCount);
  const melLog = new Float64Array(MEL_BANDS);
  let previousMelLog: Float64Array | null = null;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const offset = frame * HOP;
    let squares = 0;
    let crossings = 0;

    for (let index = 0; index < FRAME; index += 1) {
      const sample = samples[offset + index];
      squares += sample * sample;
      if (Math.abs(sample) > peak) peak = Math.abs(sample);
      if (index > 0 && (sample >= 0) !== (samples[offset + index - 1] >= 0)) crossings += 1;
      real[index] = sample * window[index];
      imag[index] = 0;
    }

    rmsValues[frame] = Math.sqrt(squares / FRAME);
    zcrs[frame] = crossings / FRAME;

    fft(real, imag);

    let magnitudeSum = 0;
    let weightedSum = 0;
    for (let bin = 0; bin < binCount; bin += 1) {
      const value = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin]);
      magnitude[bin] = value;
      magnitudeSum += value;
      weightedSum += value * binFrequencies[bin];
    }

    const centroid = magnitudeSum > EPS ? weightedSum / magnitudeSum : 0;
    centroids[frame] = centroid;

    let spread = 0;
    let cumulative = 0;
    let rolloffBin = binCount - 1;
    let rolloffFound = false;
    for (let bin = 0; bin < binCount; bin += 1) {
      const delta = binFrequencies[bin] - centroid;
      spread += magnitude[bin] * delta * delta;
      cumulative += magnitude[bin];
      if (!rolloffFound && cumulative >= 0.85 * magnitudeSum) {
        rolloffBin = bin;
        rolloffFound = true;
      }
    }
    bandwidths[frame] = magnitudeSum > EPS ? Math.sqrt(spread / magnitudeSum) : 0;
    rolloffs[frame] = binFrequencies[rolloffBin];

    // planicidade espectral: ruido tende a 1, sinal tonal tende a 0
    let logSum = 0;
    let powerSum = 0;
    for (let bin = 1; bin < binCount; bin += 1) {
      const power = magnitude[bin] * magnitude[bin] + EPS;
      logSum += Math.log(power);
      powerSum += power;
    }
    const geometric = Math.exp(logSum / (binCount - 1));
    const arithmetic = powerSum / (binCount - 1);
    flatnessValues[frame] = arithmetic > EPS ? geometric / arithmetic : 0;

    let chromaSum = 0;
    const chromaFrame = new Float64Array(12);
    for (let bin = 0; bin < binCount; bin += 1) {
      const pitch = pitchClasses[bin];
      if (pitch >= 0) {
        chromaFrame[pitch] += magnitude[bin];
        chromaSum += magnitude[bin];
      }
    }
    if (chromaSum > EPS) {
      for (let pitch = 0; pitch < 12; pitch += 1) chromaTotals[pitch] += chromaFrame[pitch] / chromaSum;
    }

    for (let band = 0; band < contrastBands.length; band += 1) {
      const bins = contrastBands[band];
      const values = bins.map((bin) => Math.log10(magnitude[bin] * magnitude[bin] + EPS));
      values.sort((a, b) => a - b);
      const quantile = Math.max(1, Math.floor(values.length * 0.02));
      const valley = mean(values.slice(0, quantile));
      const peak = mean(values.slice(values.length - quantile));
      contrastTotals[band] += peak - valley;
    }

    for (let band = 0; band < MEL_BANDS; band += 1) {
      let energy = 0;
      for (const { bin, weight } of melBank[band]) {
        energy += magnitude[bin] * magnitude[bin] * weight;
      }
      melLog[band] = 10 * Math.log10(Math.max(energy, EPS));
    }

    for (let coefficient = 0; coefficient < MFCC_COUNT; coefficient += 1) {
      const row = dct[coefficient];
      let total = 0;
      for (let band = 0; band < MEL_BANDS; band += 1) total += row[band] * melLog[band];
      mfccFrames[coefficient][frame] = total;
    }

    if (previousMelLog) {
      let flux = 0;
      for (let band = 0; band < MEL_BANDS; band += 1) {
        flux += Math.max(0, melLog[band] - previousMelLog[band]);
      }
      onsetEnvelope.push(flux);
    }
    previousMelLog = Float64Array.from(melLog);
  }

  const vector: number[] = [];
  for (let coefficient = 0; coefficient < MFCC_COUNT; coefficient += 1) {
    vector.push(mean(mfccFrames[coefficient]), std(mfccFrames[coefficient]));
  }
  for (let pitch = 0; pitch < 12; pitch += 1) {
    vector.push(chromaTotals[pitch] / frameCount);
  }
  for (let band = 0; band < contrastBands.length; band += 1) {
    vector.push(contrastTotals[band] / frameCount);
  }
  for (const series of [centroids, rolloffs, bandwidths, zcrs, rmsValues]) {
    vector.push(mean(series), std(series));
  }

  const tempo = estimateTempo(onsetEnvelope);
  vector.push(tempo);

  return {
    vector,
    summary: {
      tempo,
      centroid: mean(centroids),
      rolloff: mean(rolloffs),
      bandwidth: mean(bandwidths),
      zcr: mean(zcrs),
      rms: mean(rmsValues),
      peak,
      contrastMean: mean(Array.from(contrastTotals, (total) => total / frameCount)),
      flatness: mean(flatnessValues),
    },
  };
}

export function pickWindows(samples: Float32Array, maxWindows = 3) {
  const windowSize = WINDOW_SECONDS * FEATURE_SAMPLE_RATE;
  if (samples.length <= windowSize * 1.3) return [samples];

  const usable = samples.length - windowSize;
  const count = Math.min(maxWindows, Math.max(1, Math.floor(samples.length / windowSize)));

  return Array.from({ length: count }, (_, index) => {
    const start = Math.round((usable * (index + 1)) / (count + 1));
    return samples.subarray(start, start + windowSize);
  });
}
