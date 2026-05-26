import * as THREE from 'three/webgpu';
import type { WaterMesh } from '../rendering/WaterMesh';
import { loadHeroBoatVisual } from './loadHeroBoatVisual';
import { lockToSurfaceHeight } from './buoyancyIntegration';
import { DEFAULT_BUOYANCY_PARAMETERS, type BuoyancyParameters } from './types';

export type FloatingBoatOptions = {
  length?: number;
  width?: number;
  mass?: number;
  /** Hull depth below the waterline sample points (visual only). */
  draft?: number;
  position?: THREE.Vector3;
  buoyancy?: Partial<BuoyancyParameters>;
  hullColor?: number;
  deckColor?: number;
};

type SamplePoint = {
  readonly local: THREE.Vector3;
  readonly world: THREE.Vector3;
  readonly water: THREE.Vector3;
};

const up = new THREE.Vector3(0, 1, 0);
const tangentX = new THREE.Vector3();
const tangentZ = new THREE.Vector3();
const fittedNormal = new THREE.Vector3();
const targetQuaternion = new THREE.Quaternion();
const localOffset = new THREE.Vector3();

/**
 * Simple boat hull with four corner sample points for pitch, roll, and height.
 * Samples the rendered displaced water mesh so collision matches what you see.
 */
export class FloatingBoat {
  readonly group: THREE.Group;
  readonly length: number;
  readonly width: number;
  readonly mass: number;
  readonly draft: number;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly buoyancy: BuoyancyParameters;
  readonly samplePoints: SamplePoint[];
  enabled = true;

  private readonly visualOptions: {
    hullColor?: number;
    deckColor?: number;
  };
  private visual: THREE.Group | null = null;

  private constructor(options: FloatingBoatOptions = {}) {
    this.length = options.length ?? 14;
    this.width = options.width ?? 5.5;
    this.mass = options.mass ?? 850;
    this.draft = options.draft ?? 1.1;
    this.buoyancy = { ...DEFAULT_BUOYANCY_PARAMETERS, ...options.buoyancy };
    this.position = (options.position ?? new THREE.Vector3(-14, 5, -10)).clone();
    this.velocity = new THREE.Vector3();
    this.visualOptions = {
      hullColor: options.hullColor,
      deckColor: options.deckColor,
    };

    const halfLength = this.length * 0.5;
    const halfWidth = this.width * 0.5;
    const localCorners = [
      new THREE.Vector3(halfLength, 0, halfWidth),
      new THREE.Vector3(halfLength, 0, -halfWidth),
      new THREE.Vector3(-halfLength, 0, -halfWidth),
      new THREE.Vector3(-halfLength, 0, halfWidth),
    ];

    this.samplePoints = localCorners.map((local) => ({
      local,
      world: new THREE.Vector3(),
      water: new THREE.Vector3(),
    }));

    this.group = new THREE.Group();
    this.group.name = 'Floating Boat';
    this.syncGroupTransform();
  }

  static async create(options: FloatingBoatOptions = {}): Promise<FloatingBoat> {
    const boat = new FloatingBoat(options);
    await boat.loadVisual();
    return boat;
  }

  private async loadVisual(): Promise<void> {
    const visual = await loadHeroBoatVisual({
      length: this.length,
      width: this.width,
      draft: this.draft,
      hullColor: this.visualOptions.hullColor,
      cabinColor: this.visualOptions.deckColor,
    });
    this.setVisual(visual);
  }

  private setVisual(visual: THREE.Group): void {
    if (this.visual) {
      this.group.remove(this.visual);
      this.disposeObject(this.visual);
    }
    this.visual = visual;
    this.group.add(visual);
  }

  reset(position?: THREE.Vector3): void {
    if (position) {
      this.position.copy(position);
    }
    this.velocity.set(0, 0, 0);
    this.group.quaternion.identity();
    this.syncGroupTransform();
  }

  update(deltaSeconds: number, water: WaterMesh): void {
    if (!this.enabled || deltaSeconds <= 0) {
      return;
    }

    let requiredCenterY = -Infinity;

    for (const point of this.samplePoints) {
      localOffset.copy(point.local).applyQuaternion(this.group.quaternion);
      const worldX = this.position.x + localOffset.x;
      const worldZ = this.position.z + localOffset.z;
      const surface = water.sampleRenderedSurface(worldX, worldZ);
      point.water.set(worldX, surface.height, worldZ);
      requiredCenterY = Math.max(requiredCenterY, surface.height - localOffset.y);
    }

    const bowPort = this.samplePoints[0]!.water;
    const bowStarboard = this.samplePoints[1]!.water;
    const sternStarboard = this.samplePoints[2]!.water;

    tangentX.subVectors(bowPort, sternStarboard);
    tangentZ.subVectors(bowStarboard, bowPort);
    fittedNormal.crossVectors(tangentX, tangentZ);

    if (fittedNormal.lengthSq() > 1e-8) {
      fittedNormal.normalize();
      if (fittedNormal.y < 0) {
        fittedNormal.multiplyScalar(-1);
      }
    } else {
      fittedNormal.set(0, 1, 0);
    }

    targetQuaternion.setFromUnitVectors(up, fittedNormal);
    this.group.quaternion.copy(targetQuaternion);

    // Re-sample once with the updated orientation for the final height solve.
    requiredCenterY = -Infinity;
    for (const point of this.samplePoints) {
      localOffset.copy(point.local).applyQuaternion(this.group.quaternion);
      const worldX = this.position.x + localOffset.x;
      const worldZ = this.position.z + localOffset.z;
      const surface = water.sampleRenderedSurface(worldX, worldZ);
      point.water.set(worldX, surface.height, worldZ);
      requiredCenterY = Math.max(requiredCenterY, surface.height - localOffset.y);
    }

    const locked = lockToSurfaceHeight(this.position.y, requiredCenterY, deltaSeconds);
    this.position.y = locked.positionY;
    this.velocity.y = locked.velocityY;

    this.velocity.x *= Math.max(0, 1 - this.buoyancy.linearDrag * deltaSeconds);
    this.velocity.z *= Math.max(0, 1 - this.buoyancy.linearDrag * deltaSeconds);
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.z += this.velocity.z * deltaSeconds;
    this.syncGroupTransform();
  }

  private syncGroupTransform(): void {
    this.group.position.copy(this.position);
  }

  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          material.dispose();
        }
      }
    });
  }

  dispose(): void {
    if (this.visual) {
      this.disposeObject(this.visual);
      this.visual = null;
    }
  }
}
