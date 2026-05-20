import type * as THREE from 'three/webgpu';
import type { OceanSimulationParameters } from './OceanSimulation';

/** Textures and parameters consumed by the water mesh and debug overlay. */
export type OceanSurfaceProvider = {
  readonly parameters: Pick<OceanSimulationParameters, 'resolution' | 'patchSize'>;
  readonly displacementDataTexture: THREE.DataTexture;
  readonly normalDataTexture: THREE.DataTexture;
  readonly jacobianDataTexture: THREE.DataTexture;
  readonly heightDataTexture: THREE.DataTexture;
  /** R = persistent accumulated crest foam in [0, 1]. */
  readonly foamDataTexture: THREE.DataTexture;
};
