import { SeededRandom } from './random';
import { directionalSpreading } from './directional';
import type { SpectrumData, SpectrumParameters } from './types';

const SQRT_HALF = Math.SQRT1_2;

function phillipsSpectrum(
  kx: number,
  kz: number,
  parameters: SpectrumParameters,
): number {
  const kLengthSq = kx * kx + kz * kz;

  if (kLengthSq < 1e-12) {
    return 0;
  }

  const windLength = Math.max(parameters.windSpeed, 0.001);
  const largestWave = (windLength * windLength) / parameters.gravity;
  const dampingLength = largestWave * parameters.smallWaveDamping;
  const longWaveDamping = Math.exp(-1 / (kLengthSq * largestWave * largestWave));
  const tinyWaveDamping = Math.exp(-kLengthSq * dampingLength * dampingLength);
  const directional = directionalSpreading(
    kx,
    kz,
    parameters.windDirection,
    parameters.directionalSpread,
  );

  return (
    parameters.amplitude *
    longWaveDamping *
    directional *
    tinyWaveDamping /
    (kLengthSq * kLengthSq)
  );
}

function spectrumSample(
  kx: number,
  kz: number,
  random: SeededRandom,
  parameters: SpectrumParameters,
): [number, number] {
  const scale = Math.sqrt(Math.max(phillipsSpectrum(kx, kz, parameters), 0)) * SQRT_HALF;
  return [random.gaussian() * scale, random.gaussian() * scale];
}

export function createPhillipsInitialSpectrum(parameters: SpectrumParameters): SpectrumData {
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
