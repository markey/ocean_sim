export type SpectrumModel = 'phillips' | 'jonswap';

export type SpectrumParameters = {
  resolution: number;
  patchSize: number;
  amplitude: number;
  windSpeed: number;
  /** Wind direction in radians, aligned with +X in simulation space. */
  windDirection: number;
  gravity: number;
  smallWaveDamping: number;
  seed: number;
  spectrumModel: SpectrumModel;
  /** Fetch distance in meters; shapes JONSWAP peak frequency. */
  fetch: number;
  /** JONSWAP peak enhancement factor gamma (typically 1–5). */
  peakEnhancement: number;
  /** Directionality of wave energy around the wind axis; higher = more wind-aligned. */
  directionalSpread: number;
};

export type SpectrumData = {
  data: Float32Array;
  parameters: SpectrumParameters;
};

export type OceanPresetId =
  | 'glassyMorning'
  | 'calmSea'
  | 'longSwell'
  | 'heavySwell'
  | 'windySea'
  | 'choppyLagoon'
  | 'openOcean'
  | 'whitecaps'
  | 'gale'
  | 'storm';

export type OceanPreset = {
  label: string;
  spectrumModel: SpectrumModel;
  amplitude: number;
  windSpeed: number;
  /** Degrees for UI; converted to radians when applied. */
  windDirection: number;
  fetch: number;
  peakEnhancement: number;
  directionalSpread: number;
  smallWaveDamping: number;
  choppiness: number;
  heightScale: number;
  timeScale: number;
  /** Optional long-wave band; off keeps mid-band sea states readable. */
  enableSwell?: boolean;
  /** Boost swell h0 relative to the default 8% of preset amplitude. */
  swellAmplitudeScale?: number;
  /** Optional fine-ripple band for sparkle and whitecap texture. */
  enableDetail?: boolean;
  /** Boost ripple h0 relative to the default 5% of preset amplitude. */
  detailAmplitudeScale?: number;
};
