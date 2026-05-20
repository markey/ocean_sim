import * as THREE from 'three/webgpu';
import type { FoamParameters } from './types';
import { DEFAULT_FOAM_PARAMETERS } from './types';

function createFoamDataTexture(resolution: number, data: Uint8Array): THREE.DataTexture {
  const result = new THREE.DataTexture(
    data,
    resolution,
    resolution,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  result.minFilter = THREE.LinearFilter;
  result.magFilter = THREE.LinearFilter;
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  result.generateMipmaps = false;
  result.needsUpdate = true;
  return result;
}

/**
 * Persistent crest foam driven by Tessendorf displacement Jacobian compression.
 *
 * Stored as RGBA8 (R = foam 0–255) for reliable WebGPU texture sampling in TSL.
 */
export class FoamAccumulator {
  readonly parameters: FoamParameters;
  readonly foamDataTexture: THREE.DataTexture;

  private readonly foamPixels: Uint8Array;

  constructor(resolution: number, parameters: FoamParameters = DEFAULT_FOAM_PARAMETERS) {
    this.parameters = { ...parameters };
    this.foamPixels = new Uint8Array(resolution * resolution * 4);
    this.foamDataTexture = createFoamDataTexture(resolution, this.foamPixels);
    this.clear();
  }

  setParameters(next: Partial<FoamParameters>): void {
    Object.assign(this.parameters, next);
  }

  clear(): void {
    this.foamPixels.fill(0);
    for (let i = 3; i < this.foamPixels.length; i += 4) {
      this.foamPixels[i] = 255;
    }
    this.foamDataTexture.needsUpdate = true;
  }

  update(deltaSeconds: number, jacobianPixels: Float32Array): void {
    if (!this.parameters.enabled || deltaSeconds <= 0) {
      return;
    }

    const { threshold, accumulationRate, decayRate, coverage } = this.parameters;
    const decay = Math.exp(-decayRate * deltaSeconds);
    const depositScale = accumulationRate * deltaSeconds;
    const invRange = threshold < 1 ? 1 / (1 - threshold) : 0;

    for (let i = 0; i < this.foamPixels.length; i += 4) {
      const jacobian = jacobianPixels[i] ?? 1;
      const compression = Math.max(jacobianPixels[i + 1] ?? 0, 1 - jacobian);
      const signal = Math.min(1, compression * coverage);
      const breaking = signal > threshold ? (signal - threshold) * invRange : 0;
      const previous = (this.foamPixels[i] ?? 0) / 255;
      const next = Math.min(1, previous * decay + breaking * depositScale);

      this.foamPixels[i] = Math.round(next * 255);
      this.foamPixels[i + 1] = 0;
      this.foamPixels[i + 2] = 0;
      this.foamPixels[i + 3] = 255;
    }

    this.foamDataTexture.needsUpdate = true;
  }

  dispose(): void {
    this.foamDataTexture.dispose();
  }
}
