import * as THREE from 'three/webgpu';

/** Height and normal on the displaced water mesh (matches what is rendered). */
export type RenderedSurfaceSample = {
  height: number;
  normal: THREE.Vector3;
};

export const RENDERED_SURFACE_SAMPLE_SCRATCH: RenderedSurfaceSample = {
  height: 0,
  normal: new THREE.Vector3(0, 1, 0),
};

/**
 * World-space Y on a deformed ocean grid at (worldX, worldZ).
 * Interpolates within the displaced quad in XZ using the same vertex layout as WaterMesh.
 */
export function sampleDisplacedGridSurface(
  worldX: number,
  worldZ: number,
  patchSize: number,
  resolution: number,
  worldSurfaceX: Float32Array,
  worldSurfaceY: Float32Array,
  worldSurfaceZ: Float32Array,
  target: RenderedSurfaceSample = RENDERED_SURFACE_SAMPLE_SCRATCH,
): RenderedSurfaceSample {
  const halfPatch = patchSize * 0.5;
  let u = (worldX + halfPatch) / patchSize;
  let v = (worldZ + halfPatch) / patchSize;
  u -= Math.floor(u);
  v -= Math.floor(v);

  const i0 = Math.floor(u * (resolution - 1));
  const j0 = Math.floor(v * (resolution - 1));

  for (let dj = -1; dj <= 1; dj += 1) {
    for (let di = -1; di <= 1; di += 1) {
      const result = sampleDisplacedGridQuad(
        worldX,
        worldZ,
        i0 + di,
        j0 + dj,
        resolution,
        worldSurfaceX,
        worldSurfaceY,
        worldSurfaceZ,
        target,
      );
      if (result) {
        return result;
      }
    }
  }

  const fallbackIndex = j0 * resolution + i0;
  target.height = worldSurfaceY[fallbackIndex] ?? 0;
  target.normal.set(0, 1, 0);
  return target;
}

function sampleDisplacedGridQuad(
  worldX: number,
  worldZ: number,
  cellX: number,
  cellY: number,
  resolution: number,
  worldSurfaceX: Float32Array,
  worldSurfaceY: Float32Array,
  worldSurfaceZ: Float32Array,
  target: RenderedSurfaceSample,
): RenderedSurfaceSample | null {
  const x0 = ((cellX % resolution) + resolution) % resolution;
  const y0 = ((cellY % resolution) + resolution) % resolution;
  const x1 = (x0 + 1) % resolution;
  const y1 = (y0 + 1) % resolution;

  const idx00 = y0 * resolution + x0;
  const idx10 = y0 * resolution + x1;
  const idx01 = y1 * resolution + x0;
  const idx11 = y1 * resolution + x1;

  const x00 = worldSurfaceX[idx00] ?? 0;
  const z00 = worldSurfaceZ[idx00] ?? 0;
  const y00 = worldSurfaceY[idx00] ?? 0;
  const x10 = worldSurfaceX[idx10] ?? 0;
  const z10 = worldSurfaceZ[idx10] ?? 0;
  const y10 = worldSurfaceY[idx10] ?? 0;
  const x01 = worldSurfaceX[idx01] ?? 0;
  const z01 = worldSurfaceZ[idx01] ?? 0;
  const y01 = worldSurfaceY[idx01] ?? 0;
  const x11 = worldSurfaceX[idx11] ?? 0;
  const z11 = worldSurfaceZ[idx11] ?? 0;
  const y11 = worldSurfaceY[idx11] ?? 0;

  const triA = interpolateTriangleHeight(
    worldX,
    worldZ,
    x00,
    z00,
    y00,
    x10,
    z10,
    y10,
    x01,
    z01,
    y01,
  );
  if (triA) {
    target.height = triA.height;
    target.normal.copy(triA.normal);
    return target;
  }

  const triB = interpolateTriangleHeight(
    worldX,
    worldZ,
    x10,
    z10,
    y10,
    x11,
    z11,
    y11,
    x01,
    z01,
    y01,
  );
  if (triB) {
    target.height = triB.height;
    target.normal.copy(triB.normal);
    return target;
  }

  return null;
}

const triangleNormalScratch = new THREE.Vector3();

function interpolateTriangleHeight(
  px: number,
  pz: number,
  ax: number,
  az: number,
  ay: number,
  bx: number,
  bz: number,
  by: number,
  cx: number,
  cz: number,
  cy: number,
): { height: number; normal: THREE.Vector3 } | null {
  const v0x = bx - ax;
  const v0z = bz - az;
  const v1x = cx - ax;
  const v1z = cz - az;
  const v2x = px - ax;
  const v2z = pz - az;

  const dot00 = v0x * v0x + v0z * v0z;
  const dot01 = v0x * v1x + v0z * v1z;
  const dot02 = v0x * v2x + v0z * v2z;
  const dot11 = v1x * v1x + v1z * v1z;
  const dot12 = v1x * v2x + v1z * v2z;
  const denom = dot00 * dot11 - dot01 * dot01;

  if (Math.abs(denom) < 1e-10) {
    return null;
  }

  const invDenom = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  const epsilon = -0.001;

  if (u < epsilon || v < epsilon || u + v > 1 - epsilon) {
    return null;
  }

  const w = 1 - u - v;
  const height = w * ay + u * by + v * cy;

  const edge1x = bx - ax;
  const edge1y = by - ay;
  const edge1z = bz - az;
  const edge2x = cx - ax;
  const edge2y = cy - ay;
  const edge2z = cz - az;
  const normalX = edge1y * edge2z - edge1z * edge2y;
  const normalY = edge1z * edge2x - edge1x * edge2z;
  const normalZ = edge1x * edge2y - edge1y * edge2x;
  const length = Math.hypot(normalX, normalY, normalZ);

  if (length < 1e-8) {
    triangleNormalScratch.set(0, 1, 0);
    return { height, normal: triangleNormalScratch };
  }

  triangleNormalScratch.set(normalX / length, normalY / length, normalZ / length);
  if (triangleNormalScratch.y < 0) {
    triangleNormalScratch.multiplyScalar(-1);
  }

  return { height, normal: triangleNormalScratch };
}
