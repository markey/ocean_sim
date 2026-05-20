import type { BuoyancyParameters } from './types';

const MAX_WATER_ACCELERATION = 22;
const MAX_AIR_DOWN_SPEED = 14;
const MAX_WATER_VERTICAL_SPEED = 5.5;

/**
 * Exponential smoothing for a moving water-surface target (reduces launch on sharp crests).
 * Drops faster than it rises so bodies do not hang above collapsing troughs.
 */
export function followTargetHeight(
  current: number,
  target: number,
  followRate: number,
  deltaSeconds: number,
): number {
  const risingBlend = 1 - Math.exp(-followRate * deltaSeconds);
  const fallingBlend = 1 - Math.exp(-followRate * 3.5 * deltaSeconds);
  const blend = target < current ? fallingBlend : risingBlend;
  return current + (target - current) * blend;
}

/**
 * Vertical motion toward a smoothed float height while on the water,
 * and gravity when the body is above the instantaneous surface.
 */
export function integrateVerticalBuoyancy(
  positionY: number,
  velocityY: number,
  /** Smoothed center height the spring tracks while in contact with water. */
  targetY: number,
  /** Instantaneous center height sitting on the water (η + offset). */
  surfaceY: number,
  mass: number,
  parameters: BuoyancyParameters,
  deltaSeconds: number,
  gravity = 9.81,
): { positionY: number; velocityY: number } {
  const airborne = positionY > surfaceY + 0.08;
  const criticalDamping = 2 * Math.sqrt(parameters.verticalStiffness * mass);
  const damping = criticalDamping * parameters.dampingRatio;

  let acceleration: number;

  if (airborne) {
    // Fall with gravity when waves collapse; light spring only when far above the surface.
    const gap = positionY - surfaceY;
    const pullDown =
      gap > 0.35
        ? (parameters.verticalStiffness * 0.2 * (surfaceY - positionY)) / mass
        : 0;
    acceleration = -gravity + pullDown - (parameters.linearDrag * 0.35 * velocityY) / mass;
  } else {
    acceleration =
      (parameters.verticalStiffness * (targetY - positionY) - damping * velocityY) / mass;
    acceleration = Math.max(
      -MAX_WATER_ACCELERATION,
      Math.min(MAX_WATER_ACCELERATION, acceleration),
    );
  }

  let nextVelocityY = velocityY + acceleration * deltaSeconds;

  if (airborne) {
    nextVelocityY = Math.max(-MAX_AIR_DOWN_SPEED, Math.min(4, nextVelocityY));
  } else {
    nextVelocityY = Math.max(
      -MAX_WATER_VERTICAL_SPEED,
      Math.min(MAX_WATER_VERTICAL_SPEED, nextVelocityY),
    );
  }

  let nextPositionY = positionY + nextVelocityY * deltaSeconds;

  if (nextPositionY < surfaceY) {
    nextPositionY = surfaceY;
    nextVelocityY = Math.max(0, nextVelocityY * 0.25);
  } else if (!airborne && nextPositionY > targetY && nextVelocityY > 0) {
    nextVelocityY *= Math.exp(-14 * deltaSeconds);
  }

  return { positionY: nextPositionY, velocityY: nextVelocityY };
}
