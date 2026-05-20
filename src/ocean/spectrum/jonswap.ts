import { SeededRandom } from './random';
import { directionalSpreading } from './directional';
import type { SpectrumData, SpectrumParameters } from './types';

const SQRT_HALF = Math.SQRT1_2;

/**
 * JONSWAP energy spectrum in wave-number space. Combines a Pierson–Moskowitz
 * tail with a peak enhancement factor gamma and fetch-limited peak frequency.
 */
function jonswapSpectrum(
  kx: number,
  kz: number,
  parameters: SpectrumParameters,
): number {
  const kLengthSq = kx * kx + kz * kz;

  if (kLengthSq < 1e-12) {
    return 0;
  }

  const kLength = Math.sqrt(kLengthSq);
  const windLength = Math.max(parameters.windSpeed, 0.001);
  const { gravity, fetch, peakEnhancement, smallWaveDamping } = parameters;

  // Fetch-limited peak wave number (rad/m), JONSWAP-style scaling.
  const dimensionlessFetch = (fetch * gravity) / (windLength * windLength);
  const kPeak =
    (gravity / (windLength * windLength)) *
    Math.pow(Math.max(dimensionlessFetch, 1), -0.22);

  const sigma = kLength < kPeak ? 0.07 : 0.09;
  const peakRatio = (kLength - kPeak) / (sigma * kPeak);
  const peakBoost = Math.pow(peakEnhancement, Math.exp(-0.5 * peakRatio * peakRatio));

  // Phillips-type high-k damping for tiny waves.
  const largestWave = (windLength * windLength) / gravity;
  const dampingLength = largestWave * smallWaveDamping;
  const tinyWaveDamping = Math.exp(-kLengthSq * dampingLength * dampingLength);

  const alpha = 0.0081;
  const pmTail = (alpha * gravity * gravity) / Math.pow(kLength, 5);
  const pmPeak = Math.exp(-1.25 * Math.pow(kPeak / kLength, 4));

  const directional = directionalSpreading(
    kx,
    kz,
    parameters.windDirection,
    parameters.directionalSpread,
  );

  return parameters.amplitude * pmTail * pmPeak * peakBoost * tinyWaveDamping * directional;
}

function spectrumSample(
  kx: number,
  kz: number,
  random: SeededRandom,
  parameters: SpectrumParameters,
): [number, number] {
  const scale = Math.sqrt(Math.max(jonswapSpectrum(kx, kz, parameters), 0)) * SQRT_HALF;
  return [random.gaussian() * scale, random.gaussian() * scale];
}

export function createJonswapInitialSpectrum(parameters: SpectrumParameters): SpectrumData {
  const { resolution, patchSize } = parameters;
  const random = new SeededRandom(parameters.seed);
  const data = new Float32Array(resolution * resolution * 4);
  const twoPiOverLength = (2 * Math.PI) / patchSize;

  for (let y = 0; y < resolution; y += 1) {
    const centeredY = y - resolution / 2;

    for (let x = 0; x < resolution; x += 1) {
      const centeredX = x - resolution / 2;
      const kx = centeredX * twoPiOverLength;
      const kz = centeredY * twoPiOverLength;
      const [h0r, h0i] = spectrumSample(kx, kz, random, parameters);
      const [h0NegR, h0NegI] = spectrumSample(-kx, -kz, random, parameters);
      const index = (y * resolution + x) * 4;

      data[index] = h0r;
      data[index + 1] = h0i;
      data[index + 2] = h0NegR;
      data[index + 3] = -h0NegI;
    }
  }

  return { data, parameters };
}
