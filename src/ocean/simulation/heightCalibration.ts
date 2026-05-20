import type { SpectrumParameters } from '../spectrum/types';

/**
 * Offline measurement (scripts/calibrate-height.ts) for windy JONSWAP defaults:
 * max |η| after 2D IFFT, before gain, resolution 256, amplitude 0.0012.
 */
const MEASURED_IFFT_PEAK = 23_236.8535;

/** Reference spectrum amplitude used for calibration. */
export const REFERENCE_SPECTRUM_AMPLITUDE = 0.0012;

/**
 * Target peak crest height in meters at heightScale = 1.0.
 * Calibrated offline (scripts/calibrate-height.ts); tuned for visible seas on a 220 m patch.
 */
export const TARGET_PEAK_HEIGHT_METERS = 10;

/**
 * FFT → world height (meters) before the height-scale slider.
 * Scales with spectrum amplitude so the Amplitude slider and height scale stay independent.
 */
export function cpuHeightGain(parameters: SpectrumParameters): number {
  const amplitudeScale = parameters.amplitude / REFERENCE_SPECTRUM_AMPLITUDE;
  const nSq = parameters.resolution * parameters.resolution;
  return (TARGET_PEAK_HEIGHT_METERS * amplitudeScale * nSq) / MEASURED_IFFT_PEAK;
}
