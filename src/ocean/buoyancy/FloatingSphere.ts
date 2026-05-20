import * as THREE from 'three/webgpu';
import type { WaterMesh } from '../rendering/WaterMesh';
import type { OceanSurfaceProvider } from '../simulation/OceanSurfaceProvider';
import { followTargetHeight, integrateVerticalBuoyancy } from './buoyancyIntegration';
import { sampleOceanSurface } from './OceanSurfaceSampler';
import { DEFAULT_BUOYANCY_PARAMETERS, type BuoyancyParameters } from './types';

export type FloatingSphereOptions = {
  radius?: number;
  mass?: number;
  /** Rest position before the first simulation step. */
  position?: THREE.Vector3;
  buoyancy?: Partial<BuoyancyParameters>;
  color?: number;
};

const up = new THREE.Vector3(0, 1, 0);
const targetQuaternion = new THREE.Quaternion();
const surfaceSampleScratch = {
  height: 0,
  displacementX: 0,
  displacementZ: 0,
  normal: new THREE.Vector3(),
};

/**
 * Buoyant sphere driven by simulated ocean height and normals.
 * Vertical motion uses a spring toward η + radius; orientation aligns to the surface normal.
 */
export class FloatingSphere {
  readonly mesh: THREE.Mesh;
  readonly radius: number;
  readonly mass: number;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly buoyancy: BuoyancyParameters;
  enabled = true;
  private smoothedTargetY = 0;

  constructor(options: FloatingSphereOptions = {}) {
    this.radius = options.radius ?? 2.4;
    this.mass = options.mass ?? 180;
    this.buoyancy = { ...DEFAULT_BUOYANCY_PARAMETERS, ...options.buoyancy };
    this.position = (options.position ?? new THREE.Vector3(12, 6, 8)).clone();
    this.velocity = new THREE.Vector3();
    this.smoothedTargetY = this.position.y;

    const geometry = new THREE.SphereGeometry(this.radius, 32, 24);
    const material = new THREE.MeshStandardMaterial({
      color: options.color ?? 0xe8a45c,
      roughness: 0.45,
      metalness: 0.08,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'Floating Sphere';
    this.mesh.castShadow = false;
    this.syncMeshTransform();
  }

  reset(position?: THREE.Vector3): void {
    if (position) {
      this.position.copy(position);
    }
    this.velocity.set(0, 0, 0);
    this.smoothedTargetY = this.position.y;
    this.syncMeshTransform();
  }

  update(deltaSeconds: number, surface: OceanSurfaceProvider, water: WaterMesh): void {
    if (!this.enabled || deltaSeconds <= 0) {
      return;
    }

    const sample = sampleOceanSurface(
      surface,
      this.position.x,
      this.position.z,
      surfaceSampleScratch,
    );
    const waterHeight = water.sampleWorldHeight(this.position.x, this.position.z);
    const surfaceY = waterHeight + this.radius;
    const targetY = followTargetHeight(
      this.smoothedTargetY,
      surfaceY,
      this.buoyancy.heightFollowRate,
      deltaSeconds,
    );
    this.smoothedTargetY = targetY;
    const vertical = integrateVerticalBuoyancy(
      this.position.y,
      this.velocity.y,
      targetY,
      surfaceY,
      this.mass,
      this.buoyancy,
      deltaSeconds,
    );

    this.position.y = vertical.positionY;
    this.velocity.y = vertical.velocityY;
    this.velocity.x *= Math.max(0, 1 - this.buoyancy.linearDrag * deltaSeconds);
    this.velocity.z *= Math.max(0, 1 - this.buoyancy.linearDrag * deltaSeconds);
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.z += this.velocity.z * deltaSeconds;
    this.syncMeshTransform();

    const blend = 1 - Math.exp(-this.buoyancy.orientationBlend * deltaSeconds);
    targetQuaternion.setFromUnitVectors(up, sample.normal);
    this.mesh.quaternion.slerp(targetQuaternion, blend);
  }

  private syncMeshTransform(): void {
    this.mesh.position.copy(this.position);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
