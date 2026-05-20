import * as THREE from 'three/webgpu';
import type { OceanPreset } from '../spectrum/types';
import {
  CASCADE_IDS,
  cascadeAmplitudesFromPreset,
  type CascadeConfig,
  type CascadeId,
  type OceanCascadeSystemParameters,
} from './cascadeConfig';
import { OceanSimulation, type OceanSimulationParameters } from './OceanSimulation';
import type { OceanSurfaceProvider } from './OceanSurfaceProvider';

function createSimulationDataTexture(
  resolution: number,
  data: Float32Array,
): THREE.DataTexture {
  const result = new THREE.DataTexture(
    data,
    resolution,
    resolution,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  result.minFilter = THREE.NearestFilter;
  result.magFilter = THREE.NearestFilter;
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  result.generateMipmaps = false;
  result.needsUpdate = true;
  return result;
}

function sampleDisplacementBilinear(
  source: Float32Array,
  sourceResolution: number,
  u: number,
  v: number,
): { x: number; y: number; z: number } {
  const wrappedU = u - Math.floor(u);
  const wrappedV = v - Math.floor(v);
  const su = wrappedU * sourceResolution;
  const sv = wrappedV * sourceResolution;
  const x0 = Math.floor(su) % sourceResolution;
  const y0 = Math.floor(sv) % sourceResolution;
  const x1 = (x0 + 1) % sourceResolution;
  const y1 = (y0 + 1) % sourceResolution;
  const fu = su - Math.floor(su);
  const fv = sv - Math.floor(sv);

  const read = (x: number, y: number) => {
    const pixelIndex = (y * sourceResolution + x) * 4;
    return {
      x: source[pixelIndex] ?? 0,
      y: source[pixelIndex + 1] ?? 0,
      z: source[pixelIndex + 2] ?? 0,
    };
  };

  const h00 = read(x0, y0);
  const h10 = read(x1, y0);
  const h01 = read(x0, y1);
  const h11 = read(x1, y1);

  const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

  const rx0 = lerp(h00.x, h10.x, fu);
  const rx1 = lerp(h01.x, h11.x, fu);
  const ry0 = lerp(h00.y, h10.y, fu);
  const ry1 = lerp(h01.y, h11.y, fu);
  const rz0 = lerp(h00.z, h10.z, fu);
  const rz1 = lerp(h01.z, h11.z, fu);

  return {
    x: lerp(rx0, rx1, fv),
    y: lerp(ry0, ry1, fv),
    z: lerp(rz0, rz1, fv),
  };
}

/**
 * Resample a cascade displacement field onto the world grid with bilinear filtering.
 */
function upsampleDisplacementField(
  source: Float32Array,
  sourceResolution: number,
  target: Float32Array,
  outputResolution: number,
  worldPatchSize: number,
  cascadePatchSize: number,
  phaseOffsetX: number,
  phaseOffsetZ: number,
): void {
  const halfPatch = worldPatchSize * 0.5;

  for (let y = 0; y < outputResolution; y += 1) {
    const worldZ = (y / outputResolution) * worldPatchSize - halfPatch;

    for (let x = 0; x < outputResolution; x += 1) {
      const worldX = (x / outputResolution) * worldPatchSize - halfPatch;
      const sampleX = worldX + phaseOffsetX;
      const sampleZ = worldZ + phaseOffsetZ;
      const u = sampleX / cascadePatchSize - Math.floor(sampleX / cascadePatchSize);
      const v = sampleZ / cascadePatchSize - Math.floor(sampleZ / cascadePatchSize);
      const sample = sampleDisplacementBilinear(source, sourceResolution, u, v);
      const pixelIndex = (y * outputResolution + x) * 4;

      target[pixelIndex] = sample.x;
      target[pixelIndex + 1] = sample.y;
      target[pixelIndex + 2] = sample.z;
      target[pixelIndex + 3] = 1;
    }
  }
}

/**
 * Runs multiple spectral simulations at different length scales and merges
 * displacement, normals, and Jacobian into textures for the water material.
 */
export class OceanCascadeSystem implements OceanSurfaceProvider {
  readonly parameters: Pick<OceanSimulationParameters, 'resolution' | 'patchSize'>;
  readonly displacementDataTexture: THREE.DataTexture;
  readonly normalDataTexture: THREE.DataTexture;
  readonly jacobianDataTexture: THREE.DataTexture;
  readonly heightDataTexture: THREE.DataTexture;

  readonly systemParameters: OceanCascadeSystemParameters;
  readonly cascades: Record<CascadeId, OceanSimulation>;

  private readonly combinedHeightPixels: Float32Array;
  private readonly combinedDisplacementPixels: Float32Array;
  private readonly combinedNormalPixels: Float32Array;
  private readonly combinedJacobianPixels: Float32Array;
  private readonly mergeHeights: Float32Array;
  private readonly mergeDisplacementX: Float32Array;
  private readonly mergeDisplacementZ: Float32Array;
  /** World-grid displacement for bands that run at lower resolution than mid. */
  private readonly upsampledDisplacement: Record<'swell' | 'detail', Float32Array>;
  private frameIndex = 0;

  constructor(systemParameters: OceanCascadeSystemParameters) {
    this.systemParameters = { ...systemParameters, cascades: { ...systemParameters.cascades } };
    for (const id of CASCADE_IDS) {
      this.systemParameters.cascades[id] = { ...systemParameters.cascades[id] };
    }

    const { resolution, worldPatchSize } = this.systemParameters;
    this.parameters = { resolution, patchSize: worldPatchSize };

    const vertexCount = resolution * resolution;
    this.combinedHeightPixels = new Float32Array(vertexCount * 4);
    this.combinedDisplacementPixels = new Float32Array(vertexCount * 4);
    this.combinedNormalPixels = new Float32Array(vertexCount * 4);
    this.combinedJacobianPixels = new Float32Array(vertexCount * 4);
    this.mergeHeights = new Float32Array(vertexCount);
    this.mergeDisplacementX = new Float32Array(vertexCount);
    this.mergeDisplacementZ = new Float32Array(vertexCount);
    this.upsampledDisplacement = {
      swell: new Float32Array(vertexCount * 4),
      detail: new Float32Array(vertexCount * 4),
    };

    this.displacementDataTexture = createSimulationDataTexture(
      resolution,
      this.combinedDisplacementPixels,
    );
    this.normalDataTexture = createSimulationDataTexture(resolution, this.combinedNormalPixels);
    this.jacobianDataTexture = createSimulationDataTexture(resolution, this.combinedJacobianPixels);
    this.heightDataTexture = createSimulationDataTexture(resolution, this.combinedHeightPixels);

    this.cascades = {
      swell: new OceanSimulation(this.buildCascadeSimulationParameters('swell')),
      mid: new OceanSimulation(this.buildCascadeSimulationParameters('mid')),
      detail: new OceanSimulation(this.buildCascadeSimulationParameters('detail')),
    };

    this.refreshUpsampledBands(['swell', 'detail']);
  }

  getCascade(id: CascadeId): OceanSimulation {
    return this.cascades[id];
  }

  getCombinedSurface(): OceanSurfaceProvider {
    return this;
  }

  getSurfaceForDebug(target: 'combined' | CascadeId): OceanSurfaceProvider {
    return target === 'combined' ? this : this.cascades[target];
  }

  async init(renderer: THREE.WebGPURenderer): Promise<void> {
    await Promise.all(CASCADE_IDS.map((id) => this.cascades[id].init(renderer)));

    for (const id of CASCADE_IDS) {
      this.cascades[id].update(renderer, 0, { computeAuxiliaryFields: false });
    }

    this.refreshUpsampledBands(['swell', 'detail']);
    this.mergeCascadeFields();
  }

  setParameters(
    next: Partial<Omit<OceanCascadeSystemParameters, 'cascades'>> & {
      cascades?: Partial<Record<CascadeId, Partial<CascadeConfig>>>;
    },
  ): void {
    if (next.cascades) {
      for (const id of CASCADE_IDS) {
        const cascadeNext = next.cascades[id];
        if (cascadeNext) {
          Object.assign(this.systemParameters.cascades[id], cascadeNext);
        }
      }
    }

    const { cascades: _cascades, ...globalNext } = next;
    Object.assign(this.systemParameters, globalNext);

    for (const id of CASCADE_IDS) {
      this.cascades[id].setParameters(this.buildCascadeSimulationParameters(id));
    }

    this.refreshUpsampledBands(['swell', 'detail']);
  }

  applyPreset(preset: OceanPreset, windDirectionRadians: number): void {
    const amplitudes = cascadeAmplitudesFromPreset(preset.amplitude);

    this.setParameters({
      spectrumModel: preset.spectrumModel,
      windSpeed: preset.windSpeed,
      windDirection: windDirectionRadians,
      fetch: preset.fetch,
      peakEnhancement: preset.peakEnhancement,
      directionalSpread: preset.directionalSpread,
      timeScale: preset.timeScale,
      seed: Date.now(),
      cascades: {
        swell: {
          amplitude: amplitudes.swell,
          choppiness: preset.choppiness * 0.6,
          heightScale: preset.heightScale,
          smallWaveDamping: preset.smallWaveDamping * 1.2,
        },
        mid: {
          amplitude: amplitudes.mid,
          choppiness: preset.choppiness,
          heightScale: preset.heightScale,
          smallWaveDamping: preset.smallWaveDamping,
        },
        detail: {
          amplitude: amplitudes.detail,
          choppiness: Math.min(1, preset.choppiness * 0.9),
          heightScale: preset.heightScale,
          smallWaveDamping: preset.smallWaveDamping * 1.5,
        },
      },
    });
  }

  setCascadeParameters(id: CascadeId, next: Partial<CascadeConfig>): void {
    Object.assign(this.systemParameters.cascades[id], next);
    this.cascades[id].setParameters(this.buildCascadeSimulationParameters(id));
    if (id === 'swell' || id === 'detail') {
      this.refreshUpsampledBands([id]);
    }
  }

  update(renderer: THREE.WebGPURenderer, deltaSeconds: number): void {
    this.frameIndex += 1;
    const { cascades } = this.systemParameters;

    // Mid band drives the primary sea surface every frame.
    if (cascades.mid.enabled) {
      this.cascades.mid.update(renderer, deltaSeconds, { computeAuxiliaryFields: false });
    }

    // Alternate low-res bands to keep frame cost closer to a single 256² simulation.
    if (cascades.swell.enabled && this.frameIndex % 2 === 0) {
      this.cascades.swell.update(renderer, deltaSeconds, { computeAuxiliaryFields: false });
      this.refreshUpsampledBands(['swell']);
    }

    if (cascades.detail.enabled && this.frameIndex % 3 === 1) {
      this.cascades.detail.update(renderer, deltaSeconds, { computeAuxiliaryFields: false });
      this.refreshUpsampledBands(['detail']);
    }

    this.mergeCascadeFields();
  }

  dispose(): void {
    for (const id of CASCADE_IDS) {
      this.cascades[id].dispose();
    }
    this.displacementDataTexture.dispose();
    this.normalDataTexture.dispose();
    this.jacobianDataTexture.dispose();
    this.heightDataTexture.dispose();
  }

  private refreshUpsampledBands(ids: Array<'swell' | 'detail'>): void {
    const { resolution, worldPatchSize } = this.systemParameters;

    for (const id of ids) {
      const cascade = this.systemParameters.cascades[id];
      const source = this.cascades[id].displacementDataTexture.image.data as Float32Array;

      upsampleDisplacementField(
        source,
        cascade.resolution,
        this.upsampledDisplacement[id],
        resolution,
        worldPatchSize,
        cascade.patchSize,
        cascade.phaseOffsetX,
        cascade.phaseOffsetZ,
      );
    }
  }

  private buildCascadeSimulationParameters(id: CascadeId): OceanSimulationParameters {
    const global = this.systemParameters;
    const cascade = global.cascades[id];

    return {
      resolution: cascade.resolution,
      patchSize: cascade.patchSize,
      amplitude: cascade.amplitude,
      windSpeed: global.windSpeed * cascade.windInfluence,
      windDirection: global.windDirection,
      gravity: global.gravity,
      smallWaveDamping: cascade.smallWaveDamping,
      seed: global.seed + CASCADE_IDS.indexOf(id) * 17,
      spectrumModel: global.spectrumModel,
      fetch: global.fetch,
      peakEnhancement: global.peakEnhancement,
      directionalSpread: global.directionalSpread,
      heightScale: cascade.heightScale,
      timeScale: global.timeScale,
      choppiness: cascade.choppiness,
    };
  }

  private accumulateDisplacementField(displacement: Float32Array): void {
    for (let i = 0; i < this.mergeHeights.length; i += 1) {
      const pixelIndex = i * 4;
      this.mergeHeights[i] = (this.mergeHeights[i] ?? 0) + (displacement[pixelIndex + 1] ?? 0);
      this.mergeDisplacementX[i] =
        (this.mergeDisplacementX[i] ?? 0) + (displacement[pixelIndex] ?? 0);
      this.mergeDisplacementZ[i] =
        (this.mergeDisplacementZ[i] ?? 0) + (displacement[pixelIndex + 2] ?? 0);
    }
  }

  private mergeCascadeFields(): void {
    const { resolution, worldPatchSize, cascades } = this.systemParameters;
    const vertexCount = resolution * resolution;

    this.mergeHeights.fill(0);
    this.mergeDisplacementX.fill(0);
    this.mergeDisplacementZ.fill(0);

    if (cascades.mid.enabled) {
      this.accumulateDisplacementField(
        this.cascades.mid.displacementDataTexture.image.data as Float32Array,
      );
    }

    if (cascades.swell.enabled) {
      this.accumulateDisplacementField(this.upsampledDisplacement.swell);
    }

    if (cascades.detail.enabled) {
      this.accumulateDisplacementField(this.upsampledDisplacement.detail);
    }

    this.writeCombinedNormals(resolution, worldPatchSize);
    this.writeCombinedJacobian(resolution, worldPatchSize);

    for (let i = 0; i < vertexCount; i += 1) {
      const pixelIndex = i * 4;
      const height = this.mergeHeights[i] ?? 0;
      const displacementX = this.mergeDisplacementX[i] ?? 0;
      const displacementZ = this.mergeDisplacementZ[i] ?? 0;

      this.combinedHeightPixels[pixelIndex] = height;
      this.combinedHeightPixels[pixelIndex + 1] = height;
      this.combinedHeightPixels[pixelIndex + 2] = height;
      this.combinedHeightPixels[pixelIndex + 3] = 1;

      this.combinedDisplacementPixels[pixelIndex] = displacementX;
      this.combinedDisplacementPixels[pixelIndex + 1] = height;
      this.combinedDisplacementPixels[pixelIndex + 2] = displacementZ;
      this.combinedDisplacementPixels[pixelIndex + 3] = 1;
    }

    this.displacementDataTexture.needsUpdate = true;
    this.normalDataTexture.needsUpdate = true;
    this.jacobianDataTexture.needsUpdate = true;
    this.heightDataTexture.needsUpdate = true;
  }

  private writeCombinedNormals(resolution: number, patchSize: number): void {
    const cellSize = patchSize / resolution;
    const halfPatch = patchSize * 0.5;
    const left = new THREE.Vector3();
    const right = new THREE.Vector3();
    const down = new THREE.Vector3();
    const up = new THREE.Vector3();
    const tangentX = new THREE.Vector3();
    const tangentZ = new THREE.Vector3();
    const normal = new THREE.Vector3();

    const writePosition = (vector: THREE.Vector3, x: number, y: number): void => {
      const wrappedX = ((x % resolution) + resolution) % resolution;
      const wrappedY = ((y % resolution) + resolution) % resolution;
      const index = wrappedY * resolution + wrappedX;

      vector.set(
        (wrappedX / resolution) * patchSize - halfPatch + (this.mergeDisplacementX[index] ?? 0),
        this.mergeHeights[index] ?? 0,
        (wrappedY / resolution) * patchSize - halfPatch + (this.mergeDisplacementZ[index] ?? 0),
      );
    };

    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const pixelIndex = (y * resolution + x) * 4;

        writePosition(left, x - 1, y);
        writePosition(right, x + 1, y);
        writePosition(down, x, y - 1);
        writePosition(up, x, y + 1);

        tangentX.subVectors(right, left).divideScalar(cellSize * 2);
        tangentZ.subVectors(up, down).divideScalar(cellSize * 2);
        normal.crossVectors(tangentZ, tangentX).normalize();

        if (normal.y < 0) {
          normal.negate();
        }

        this.combinedNormalPixels[pixelIndex] = normal.x * 0.5 + 0.5;
        this.combinedNormalPixels[pixelIndex + 1] = normal.y * 0.5 + 0.5;
        this.combinedNormalPixels[pixelIndex + 2] = normal.z * 0.5 + 0.5;
        this.combinedNormalPixels[pixelIndex + 3] = 1;
      }
    }
  }

  private writeCombinedJacobian(resolution: number, patchSize: number): void {
    const cellSize = patchSize / resolution;
    const invTwoCell = 1 / (2 * cellSize);

    const sample = (field: Float32Array, x: number, y: number): number => {
      const wrappedX = ((x % resolution) + resolution) % resolution;
      const wrappedY = ((y % resolution) + resolution) % resolution;
      return field[wrappedY * resolution + wrappedX] ?? 0;
    };

    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const pixelIndex = (y * resolution + x) * 4;
        const dDxDx =
          (sample(this.mergeDisplacementX, x + 1, y) -
            sample(this.mergeDisplacementX, x - 1, y)) *
          invTwoCell;
        const dDxDz =
          (sample(this.mergeDisplacementX, x, y + 1) -
            sample(this.mergeDisplacementX, x, y - 1)) *
          invTwoCell;
        const dDzDx =
          (sample(this.mergeDisplacementZ, x + 1, y) -
            sample(this.mergeDisplacementZ, x - 1, y)) *
          invTwoCell;
        const dDzDz =
          (sample(this.mergeDisplacementZ, x, y + 1) -
            sample(this.mergeDisplacementZ, x, y - 1)) *
          invTwoCell;
        const jacobian = (1 + dDxDx) * (1 + dDzDz) - dDxDz * dDzDx;

        this.combinedJacobianPixels[pixelIndex] = jacobian;
        this.combinedJacobianPixels[pixelIndex + 1] = Math.max(0, 1 - jacobian);
        this.combinedJacobianPixels[pixelIndex + 2] = 0;
        this.combinedJacobianPixels[pixelIndex + 3] = 1;
      }
    }
  }
}
