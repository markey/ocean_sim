import type { SpectrumParameters } from '../spectrum/types';

/**
 * Offline measurement (scripts/calibrate-height.ts) for windy JONSWAP defaults:
 * max |η| after 2D IFFT, before gain, resolution 256, patch 160 m, amplitude 0.0012.
 */
const MEASURED_IFFT_PEAK = 431.6629;

/** Reference spectrum amplitude used for calibration. */
export const REFERENCE_SPECTRUM_AMPLITUDE = 0.0012;

/**
 * Target peak crest height in meters at heightScale = 1.0 on the 160 m mid band.
 * Calibrated offline (scripts/calibrate-height.ts) for amplitude 0.0012 / windy JONSWAP.
 */
/** Visible crest height (m) on the 220 m mid band at reference amplitude / heightScale 1. */
export const TARGET_PEAK_HEIGHT_METERS = 12;

/**
 * FFT → world height (meters) before the height-scale slider.
 * The spectrum stores energy, so h0 already grows with sqrt(amplitude).
 * Applying sqrt(amplitude) here makes the final visible height change roughly
 * linearly with the preset amplitude instead of over-compressing gentle seas.
 */
export function cpuHeightGain(parameters: SpectrumParameters): number {
  const amplitudeScale = Math.sqrt(parameters.amplitude / REFERENCE_SPECTRUM_AMPLITUDE);
  const nSq = parameters.resolution * parameters.resolution;
  return (TARGET_PEAK_HEIGHT_METERS * amplitudeScale * nSq) / MEASURED_IFFT_PEAK;
}
