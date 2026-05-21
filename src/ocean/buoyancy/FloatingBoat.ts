import * as THREE from 'three/webgpu';
import type { OceanSurfaceProvider } from '../simulation/OceanSurfaceProvider';
import { buildHeroBoatVisual } from './buildHeroBoatVisual';
import { followTargetHeight, integrateVerticalBuoyancy } from './buoyancyIntegration';
import { sampleOceanSurfacePoint } from './OceanSurfaceSampler';
import { DEFAULT_BUOYANCY_PARAMETERS, type BuoyancyParameters } from './types';

export type FloatingBoatOptions = {
  length?: number;
  width?: number;
  mass?: number;
  /** Hull center sits this far below the sampled water plane at rest. */
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
 * Each point reads the simulated displaced surface; the hull orients to the fitted plane.
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
  private smoothedTargetY = 0;

  constructor(options: FloatingBoatOptions = {}) {
    this.length = options.length ?? 14;
    this.width = options.width ?? 5.5;
    this.mass = options.mass ?? 850;
    this.draft = options.draft ?? 1.1;
    this.buoyancy = { ...DEFAULT_BUOYANCY_PARAMETERS, ...options.buoyancy };
    this.position = (options.position ?? new THREE.Vector3(-14, 5, -10)).clone();
    this.velocity = new THREE.Vector3();
    this.smoothedTargetY = this.position.y;

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
    this.group.add(
      buildHeroBoatVisual({
        length: this.length,
        width: this.width,
        draft: this.draft,
        hullColor: options.hullColor,
        cabinColor: options.deckColor,
      }),
    );
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

    let averageWaterHeight = 0;

    for (const point of this.samplePoints) {
      localOffset.copy(point.local).applyQuaternion(this.group.quaternion);
      point.world.set(
        this.position.x + localOffset.x,
        this.position.y,
        this.position.z + localOffset.z,
      );
      sampleOceanSurfacePoint(surface, point.world.x, point.world.z, point.water);
      averageWaterHeight += point.water.y;
    }

    averageWaterHeight /= this.samplePoints.length;
    const surfaceY = averageWaterHeight + this.draft;
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

    const blend = 1 - Math.exp(-this.buoyancy.orientationBlend * deltaSeconds);
    targetQuaternion.setFromUnitVectors(up, fittedNormal);
    this.group.quaternion.slerp(targetQuaternion, blend);
    this.syncGroupTransform();
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
