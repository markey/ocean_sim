/**
 * One-shot calibration: measures IFFT peak height for default windy JONSWAP
 * and prints a sane CPU_HEIGHT_GAIN for ~3.5 m peaks at heightScale = 1.
 */
import { createInitialSpectrum } from '../src/ocean/spectrum/index.ts';
import {
  TARGET_PEAK_HEIGHT_METERS,
} from '../src/ocean/simulation/heightCalibration.ts';
import type { SpectrumParameters } from '../src/ocean/spectrum/types.ts';
const RESOLUTION = 256;

const defaults: SpectrumParameters = {
  resolution: RESOLUTION,
  patchSize: 220,
  amplitude: 0.0012,
  windSpeed: 16,
  windDirection: (40 * Math.PI) / 180,
  gravity: 9.81,
  smallWaveDamping: 0.02,
  seed: 1337,
  spectrumModel: 'jonswap',
  fetch: 250_000,
  peakEnhancement: 3.3,
  directionalSpread: 6,
};

function inverseFft1D(data: Float32Array, resolution: number): void {
  for (let i = 1, j = 0; i < resolution; i += 1) {
    let bit = resolution >> 1;
    for (; (j & bit) !== 0; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const iR = i * 2;
      const jR = j * 2;
      const real = data[iR] ?? 0;
      const imag = data[iR + 1] ?? 0;
      data[iR] = data[jR] ?? 0;
      data[iR + 1] = data[jR + 1] ?? 0;
      data[jR] = real;
      data[jR + 1] = imag;
    }
  }

  for (let length = 2; length <= resolution; length <<= 1) {
    const halfLength = length >> 1;
    const angleStep = (2 * Math.PI) / length;
    for (let start = 0; start < resolution; start += length) {
      for (let offset = 0; offset < halfLength; offset += 1) {
        const evenIndex = (start + offset) * 2;
        const oddIndex = (start + offset + halfLength) * 2;
        const angle = angleStep * offset;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const oddR = data[oddIndex] ?? 0;
        const oddI = data[oddIndex + 1] ?? 0;
        const rotatedR = wr * oddR - wi * oddI;
        const rotatedI = wr * oddI + wi * oddR;
        const evenR = data[evenIndex] ?? 0;
        const evenI = data[evenIndex + 1] ?? 0;
        data[evenIndex] = evenR + rotatedR;
        data[evenIndex + 1] = evenI + rotatedI;
        data[oddIndex] = evenR - rotatedR;
        data[oddIndex + 1] = evenI - rotatedI;
      }
    }
  }
}

function inverseFft2D(data: Float32Array, resolution: number, scratch: Float32Array): void {
  for (let y = 0; y < resolution; y += 1) {
    const rowOffset = y * resolution * 2;
    for (let x = 0; x < resolution; x += 1) {
      scratch[x * 2] = data[rowOffset + x * 2] ?? 0;
      scratch[x * 2 + 1] = data[rowOffset + x * 2 + 1] ?? 0;
    }
    inverseFft1D(scratch, resolution);
    for (let x = 0; x < resolution; x += 1) {
      data[rowOffset + x * 2] = scratch[x * 2] ?? 0;
      data[rowOffset + x * 2 + 1] = scratch[x * 2 + 1] ?? 0;
    }
  }

  for (let x = 0; x < resolution; x += 1) {
    for (let y = 0; y < resolution; y += 1) {
      const sourceIndex = (y * resolution + x) * 2;
      scratch[y * 2] = data[sourceIndex] ?? 0;
      scratch[y * 2 + 1] = data[sourceIndex + 1] ?? 0;
    }
    inverseFft1D(scratch, resolution);
    for (let y = 0; y < resolution; y += 1) {
      const targetIndex = (y * resolution + x) * 2;
      data[targetIndex] = scratch[y * 2] ?? 0;
      data[targetIndex + 1] = scratch[y * 2 + 1] ?? 0;
    }
  }
}

function measurePeakHeight(parameters: SpectrumParameters, time: number): number {
  const { resolution, patchSize, gravity } = parameters;
  const { data: spectrumData } = createInitialSpectrum(parameters);
  const spectrum = new Float32Array(resolution * resolution * 2);
  const scratch = new Float32Array(resolution * 2);
  const twoPiOverLength = (2 * Math.PI) / patchSize;

  for (let y = 0; y < resolution; y += 1) {
    const centeredY = y - resolution / 2;
    for (let x = 0; x < resolution; x += 1) {
      const centeredX = x - resolution / 2;
      const spectrumIndex = (y * resolution + x) * 4;
      const outputIndex = (y * resolution + x) * 2;
      const kx = centeredX * twoPiOverLength;
      const kz = centeredY * twoPiOverLength;
      const kLength = Math.hypot(kx, kz);
      const omega = Math.sqrt(gravity * kLength);
      const phase = omega * time;
      const cosPhase = Math.cos(phase);
      const sinPhase = Math.sin(phase);
      const h0r = spectrumData[spectrumIndex] ?? 0;
      const h0i = spectrumData[spectrumIndex + 1] ?? 0;
      const h0MinusR = spectrumData[spectrumIndex + 2] ?? 0;
      const h0MinusI = spectrumData[spectrumIndex + 3] ?? 0;
      const positiveR = h0r * cosPhase - h0i * sinPhase;
      const positiveI = h0r * sinPhase + h0i * cosPhase;
      const negativeR = h0MinusR * cosPhase + h0MinusI * sinPhase;
      const negativeI = -h0MinusR * sinPhase + h0MinusI * cosPhase;
      spectrum[outputIndex] = positiveR + negativeR;
      spectrum[outputIndex + 1] = positiveI + negativeI;
    }
  }

  inverseFft2D(spectrum, resolution, scratch);

  let peak = 0;
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const sourceIndex = (y * resolution + x) * 2;
      const checker = (x + y) % 2 === 0 ? 1 : -1;
      const value = Math.abs((spectrum[sourceIndex] ?? 0) * checker);
      if (value > peak) {
        peak = value;
      }
    }
  }

  return peak;
}

let maxPeak = 0;
for (let t = 0; t < 20; t += 0.37) {
  maxPeak = Math.max(maxPeak, measurePeakHeight(defaults, t));
}

const nSq = RESOLUTION * RESOLUTION;
const saneGain = (TARGET_PEAK_HEIGHT_METERS * nSq) / maxPeak;

console.log('Measured max IFFT peak (pre-gain):', maxPeak.toFixed(4));
console.log('Target peak height (m):', TARGET_PEAK_HEIGHT_METERS);
console.log('cpuHeightGain() at defaults:', Math.round(saneGain));
