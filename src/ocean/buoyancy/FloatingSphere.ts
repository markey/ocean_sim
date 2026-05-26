import * as THREE from 'three/webgpu';
import type { WaterMesh } from '../rendering/WaterMesh';
import { lockToSurfaceHeight } from './buoyancyIntegration';
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

/**
 * Buoyant sphere driven by the rendered ocean mesh height and normals.
 */
export class FloatingSphere {
  readonly mesh: THREE.Mesh;
  readonly radius: number;
  readonly mass: number;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly buoyancy: BuoyancyParameters;
  enabled = true;

  constructor(options: FloatingSphereOptions = {}) {
    this.radius = options.radius ?? 2.4;
    this.mass = options.mass ?? 180;
    this.buoyancy = { ...DEFAULT_BUOYANCY_PARAMETERS, ...options.buoyancy };
    this.position = (options.position ?? new THREE.Vector3(12, 6, 8)).clone();
    this.velocity = new THREE.Vector3();

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
    this.syncMeshTransform();
  }

  update(deltaSeconds: number, water: WaterMesh): void {
    if (!this.enabled || deltaSeconds <= 0) {
      return;
    }

    const surface = water.sampleRenderedSurface(this.position.x, this.position.z);
    const surfaceY = surface.height + this.radius;
    const locked = lockToSurfaceHeight(this.position.y, surfaceY, deltaSeconds);

    this.position.y = locked.positionY;
    this.velocity.y = locked.velocityY;
    this.velocity.x *= Math.max(0, 1 - this.buoyancy.linearDrag * deltaSeconds);
    this.velocity.z *= Math.max(0, 1 - this.buoyancy.linearDrag * deltaSeconds);
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.z += this.velocity.z * deltaSeconds;
    this.syncMeshTransform();

    targetQuaternion.setFromUnitVectors(up, surface.normal);
    this.mesh.quaternion.copy(targetQuaternion);
  }

  private syncMeshTransform(): void {
    this.mesh.position.copy(this.position);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
