import * as THREE from 'three/webgpu';
import type { OceanSurfaceProvider } from '../simulation/OceanSurfaceProvider';
import { followTargetHeight, integrateVerticalBuoyancy } from './buoyancyIntegration';
import { sampleOceanSurfaceHeight } from './OceanSurfaceSampler';
import { DEFAULT_BUOYANCY_PARAMETERS, type BuoyancyParameters } from './types';

export type FloatingBuoyOptions = {
  mass?: number;
  /** Rest position before the first simulation step. */
  position?: THREE.Vector3;
  buoyancy?: Partial<BuoyancyParameters>;
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
 * Simple channel marker buoy that bobs on the simulated ocean surface.
 * Replaces the debug sphere in the Milestone 11 benchmark composition.
 */
export class FloatingBuoy {
  readonly group: THREE.Group;
  readonly mass: number;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly buoyancy: BuoyancyParameters;
  /** Approximate float radius used for height sampling. */
  readonly floatRadius: number;
  enabled = true;
  private smoothedTargetY = 0;

  constructor(options: FloatingBuoyOptions = {}) {
    this.mass = options.mass ?? 42;
    this.floatRadius = 1.05;
    this.buoyancy = { ...DEFAULT_BUOYANCY_PARAMETERS, ...options.buoyancy };
    this.position = (options.position ?? new THREE.Vector3(-68, 4, -82)).clone();
    this.velocity = new THREE.Vector3();
    this.smoothedTargetY = this.position.y;

    this.group = new THREE.Group();
    this.group.name = 'Floating Buoy';
    this.group.add(this.buildVisual());
    this.syncGroupTransform();
  }

  reset(position?: THREE.Vector3): void {
    if (position) {
      this.position.copy(position);
    }
    this.velocity.set(0, 0, 0);
    this.smoothedTargetY = this.position.y;
    this.group.quaternion.identity();
    this.syncGroupTransform();
  }

  update(deltaSeconds: number, surface: OceanSurfaceProvider): void {
    if (!this.enabled || deltaSeconds <= 0) {
      return;
    }

    const waterHeight = sampleOceanSurfaceHeight(
      surface,
      this.position.x,
      this.position.z,
      surfaceSampleScratch,
    );
    const surfaceY = waterHeight + this.floatRadius;
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
    this.syncGroupTransform();

    const blend = 1 - Math.exp(-this.buoyancy.orientationBlend * deltaSeconds * 0.35);
    targetQuaternion.setFromUnitVectors(up, surfaceSampleScratch.normal);
    this.group.quaternion.slerp(targetQuaternion, blend);
  }

  private buildVisual(): THREE.Group {
    const visual = new THREE.Group();
    visual.name = 'Buoy Visual';

    const yellowMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8c63a,
      roughness: 0.48,
      metalness: 0.06,
    });
    const blackMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1410,
      roughness: 0.72,
      metalness: 0.02,
    });
    const redMaterial = new THREE.MeshStandardMaterial({
      color: 0xb53a28,
      roughness: 0.55,
      metalness: 0.04,
    });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, 1.6, 12), redMaterial);
    base.position.y = -0.55;

    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.42, 12), blackMaterial);
    band.position.y = 0.35;

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 1.35, 12), yellowMaterial);
    body.position.y = 1.15;

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.95, 12), yellowMaterial);
    cap.position.y = 2.25;

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 8, 16), blackMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.55;

    visual.add(base, band, body, cap, ring);
    return visual;
  }

  private syncGroupTransform(): void {
    this.group.position.copy(this.position);
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
}
