import * as THREE from 'three/webgpu';
import type { OceanSurfaceProvider } from '../simulation/OceanSurfaceProvider';

/** Height, horizontal chop, and upward-facing normal at a world XZ location. */
export type OceanSurfaceSample = {
  height: number;
  displacementX: number;
  displacementZ: number;
  normal: THREE.Vector3;
};

const scratchSample: OceanSurfaceSample = {
  height: 0,
  displacementX: 0,
  displacementZ: 0,
  normal: new THREE.Vector3(0, 1, 0),
};

function sampleBilinearChannel(
  source: Float32Array,
  resolution: number,
  u: number,
  v: number,
  channel: 0 | 1 | 2,
): number {
  const wrappedU = u - Math.floor(u);
  const wrappedV = v - Math.floor(v);
  const su = wrappedU * resolution;
  const sv = wrappedV * resolution;
  const x0 = Math.floor(su) % resolution;
  const y0 = Math.floor(sv) % resolution;
  const x1 = (x0 + 1) % resolution;
  const y1 = (y0 + 1) % resolution;
  const fu = su - Math.floor(su);
  const fv = sv - Math.floor(sv);

  const read = (x: number, y: number) => source[(y * resolution + x) * 4 + channel] ?? 0;

  const h00 = read(x0, y0);
  const h10 = read(x1, y0);
  const h01 = read(x0, y1);
  const h11 = read(x1, y1);
  const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

  return lerp(lerp(h00, h10, fu), lerp(h01, h11, fu), fv);
}

function worldToSimulationUv(worldX: number, worldZ: number, patchSize: number): { u: number; v: number } {
  const halfPatch = patchSize * 0.5;
  return {
    u: (worldX + halfPatch) / patchSize,
    v: (worldZ + halfPatch) / patchSize,
  };
}

function sampleOceanSurfaceRaw(
  surface: OceanSurfaceProvider,
  worldX: number,
  worldZ: number,
  target: OceanSurfaceSample,
): OceanSurfaceSample {
  const { resolution, patchSize } = surface.parameters;
  const displacement = surface.displacementDataTexture.image.data as Float32Array;
  const normals = surface.normalDataTexture.image.data as Float32Array;
  const { u, v } = worldToSimulationUv(worldX, worldZ, patchSize);

  target.displacementX = sampleBilinearChannel(displacement, resolution, u, v, 0);
  target.height = sampleBilinearChannel(displacement, resolution, u, v, 1);
  target.displacementZ = sampleBilinearChannel(displacement, resolution, u, v, 2);

  const encodedNx = sampleBilinearChannel(normals, resolution, u, v, 0);
  const encodedNy = sampleBilinearChannel(normals, resolution, u, v, 1);
  const encodedNz = sampleBilinearChannel(normals, resolution, u, v, 2);

  target.normal.set(
    encodedNx * 2 - 1,
    encodedNy * 2 - 1,
    encodedNz * 2 - 1,
  );

  if (target.normal.lengthSq() > 1e-8) {
    target.normal.normalize();
  } else {
    target.normal.set(0, 1, 0);
  }

  if (target.normal.y < 0) {
    target.normal.multiplyScalar(-1);
  }

  return target;
}

/**
 * Bilinear sample of the merged simulation field at a world-space XZ point.
 * Reads CPU-side DataTexture pixels produced by {@link OceanCascadeSystem}.
 */
export function sampleOceanSurface(
  surface: OceanSurfaceProvider,
  worldX: number,
  worldZ: number,
  target: OceanSurfaceSample = scratchSample,
): OceanSurfaceSample {
  return sampleOceanSurfaceRaw(surface, worldX, worldZ, target);
}

/**
 * World-space water height at (worldX, worldZ) for buoyancy.
 * Inverts horizontal chop so η matches the displaced surface the water mesh renders.
 */
export function sampleOceanSurfaceHeight(
  surface: OceanSurfaceProvider,
  worldX: number,
  worldZ: number,
  target: OceanSurfaceSample = scratchSample,
): number {
  let sampleX = worldX;
  let sampleZ = worldZ;

  // Tessendorf inverse lookup: find the grid point that landed under this world column.
  for (let i = 0; i < 3; i += 1) {
    sampleOceanSurfaceRaw(surface, sampleX, sampleZ, target);
    sampleX = worldX - target.displacementX;
    sampleZ = worldZ - target.displacementZ;
  }

  sampleOceanSurfaceRaw(surface, sampleX, sampleZ, target);
  return target.height;
}

/** World-space point on the displaced ocean surface (Y = η). */
export function sampleOceanSurfacePoint(
  surface: OceanSurfaceProvider,
  worldX: number,
  worldZ: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const sample = sampleOceanSurface(surface, worldX, worldZ);
  const height = sampleOceanSurfaceHeight(surface, worldX, worldZ, sample);
  return target.set(
    worldX + sample.displacementX,
    height,
    worldZ + sample.displacementZ,
  );
}
