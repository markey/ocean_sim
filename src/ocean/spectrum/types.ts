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
  /** Directional spreading power s in cos^(2s)(theta/2). */
  directionalSpread: number;
};

export type SpectrumData = {
  data: Float32Array;
  parameters: SpectrumParameters;
};

export type OceanPresetId = 'calmSea' | 'windySea' | 'storm' | 'longSwell';

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
};
