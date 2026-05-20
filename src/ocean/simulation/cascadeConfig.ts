import type { SpectrumModel } from '../spectrum/types';

export type CascadeId = 'swell' | 'mid' | 'detail';

/** Per-cascade simulation tuning (length scale, energy, chop, wind coupling). */
export type CascadeConfig = {
  label: string;
  enabled: boolean;
  /** FFT grid resolution for this band (lower = cheaper for swell/ripples). */
  resolution: number;
  /** Physical extent of this cascade's repeating tile in meters. */
  patchSize: number;
  /** Spectrum amplitude for h0(k). */
  amplitude: number;
  /** Multiplier on the global wind speed for this band. */
  windInfluence: number;
  /** World-space UV offset (meters) to de-align cascade tiling on the water patch. */
  phaseOffsetX: number;
  phaseOffsetZ: number;
  choppiness: number;
  heightScale: number;
  smallWaveDamping: number;
};

export type OceanCascadeSystemParameters = {
  worldPatchSize: number;
  resolution: number;
  gravity: number;
  timeScale: number;
  windSpeed: number;
  windDirection: number;
  spectrumModel: SpectrumModel;
  fetch: number;
  peakEnhancement: number;
  directionalSpread: number;
  seed: number;
  cascades: Record<CascadeId, CascadeConfig>;
};

export const CASCADE_IDS: CascadeId[] = ['swell', 'mid', 'detail'];

/**
 * Relative h0 amplitude per band when applying a preset.
 * Mid carries most energy; swell and detail add layered motion without triple-counting height.
 */
export const CASCADE_AMPLITUDE_RATIOS: Record<CascadeId, number> = {
  swell: 0.08,
  mid: 1,
  detail: 0.05,
};

export type CascadeAmplitudeOptions = {
  /** Multiplier on the default swell share (use >1 when swell cascade is enabled). */
  swellScale?: number;
  detailScale?: number;
};

export function cascadeAmplitudesFromPreset(
  presetAmplitude: number,
  options: CascadeAmplitudeOptions = {},
): Record<CascadeId, number> {
  const swellRatio = CASCADE_AMPLITUDE_RATIOS.swell * (options.swellScale ?? 1);
  const detailRatio = CASCADE_AMPLITUDE_RATIOS.detail * (options.detailScale ?? 1);

  return {
    swell: presetAmplitude * swellRatio,
    mid: presetAmplitude * CASCADE_AMPLITUDE_RATIOS.mid,
    detail: presetAmplitude * detailRatio,
  };
}

/** Default three-band cascade split: long swell, sea, fine ripples. */
export const DEFAULT_CASCADE_CONFIGS: Record<CascadeId, CascadeConfig> = {
  swell: {
    label: 'Swell',
    enabled: false,
    resolution: 128,
    patchSize: 512,
    amplitude: cascadeAmplitudesFromPreset(0.0012).swell,
    windInfluence: 1,
    phaseOffsetX: 37,
    phaseOffsetZ: 53,
    choppiness: 0.25,
    heightScale: 1,
    smallWaveDamping: 0.04,
  },
  mid: {
    label: 'Mid waves',
    enabled: true,
    resolution: 256,
    patchSize: 160,
    amplitude: cascadeAmplitudesFromPreset(0.0012).mid,
    windInfluence: 1,
    phaseOffsetX: 0,
    phaseOffsetZ: 0,
    choppiness: 0.48,
    heightScale: 1,
    smallWaveDamping: 0.019,
  },
  detail: {
    label: 'Ripples',
    enabled: false,
    resolution: 128,
    patchSize: 41,
    amplitude: cascadeAmplitudesFromPreset(0.0012).detail,
    windInfluence: 0.65,
    phaseOffsetX: 11,
    phaseOffsetZ: 19,
    choppiness: 0.35,
    heightScale: 1,
    smallWaveDamping: 0.06,
  },
};

export function createDefaultCascadeSystemParameters(): OceanCascadeSystemParameters {
  return {
    worldPatchSize: 160,
    /** Output / mid-band resolution; swell and detail may use lower internal grids. */
    resolution: DEFAULT_CASCADE_CONFIGS.mid.resolution,
    gravity: 9.81,
    timeScale: 1,
    windSpeed: 15,
    windDirection: (40 * Math.PI) / 180,
    spectrumModel: 'jonswap',
    fetch: 280_000,
    peakEnhancement: 3.2,
    directionalSpread: 5.5,
    seed: 1337,
    cascades: {
      swell: { ...DEFAULT_CASCADE_CONFIGS.swell },
      mid: { ...DEFAULT_CASCADE_CONFIGS.mid },
      detail: { ...DEFAULT_CASCADE_CONFIGS.detail },
    },
  };
}
