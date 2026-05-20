import { createJonswapInitialSpectrum } from './jonswap';
import { createPhillipsInitialSpectrum } from './phillips';
import type { SpectrumData, SpectrumParameters } from './types';

export { createPhillipsInitialSpectrum } from './phillips';
export { createJonswapInitialSpectrum } from './jonswap';
export { directionalSpreading } from './directional';
export { OCEAN_PRESETS, OCEAN_PRESET_IDS } from './presets';
export type {
  OceanPreset,
  OceanPresetId,
  SpectrumData,
  SpectrumModel,
  SpectrumParameters,
} from './types';

export function createInitialSpectrum(parameters: SpectrumParameters): SpectrumData {
  if (parameters.spectrumModel === 'jonswap') {
    return createJonswapInitialSpectrum(parameters);
  }

  return createPhillipsInitialSpectrum(parameters);
}
