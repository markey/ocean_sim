import type { BuoyancyParameters } from './types';

const MAX_VERTICAL_ACCELERATION = 22;
const MAX_VERTICAL_SPEED = 5.5;

/**
 * Exponential smoothing for a moving water-surface target (reduces launch on sharp crests).
 */
export function followTargetHeight(
  current: number,
  target: number,
  followRate: number,
  deltaSeconds: number,
): number {
  const blend = 1 - Math.exp(-followRate * deltaSeconds);
  return current + (target - current) * blend;
}

/**
 * Vertical spring-damper toward a target water height.
 * Uses mass-scaled critical damping and limits upward motion above the surface.
 */
export function integrateVerticalBuoyancy(
  positionY: number,
  velocityY: number,
  targetY: number,
  mass: number,
  parameters: BuoyancyParameters,
  deltaSeconds: number,
): { positionY: number; velocityY: number } {
  const criticalDamping = 2 * Math.sqrt(parameters.verticalStiffness * mass);
  const damping = criticalDamping * parameters.dampingRatio;

  let acceleration =
    (parameters.verticalStiffness * (targetY - positionY) - damping * velocityY) / mass;
  acceleration = Math.max(
    -MAX_VERTICAL_ACCELERATION,
    Math.min(MAX_VERTICAL_ACCELERATION, acceleration),
  );

  let nextVelocityY = velocityY + acceleration * deltaSeconds;
  nextVelocityY = Math.max(
    -MAX_VERTICAL_SPEED,
    Math.min(MAX_VERTICAL_SPEED, nextVelocityY),
  );

  let nextPositionY = positionY + nextVelocityY * deltaSeconds;

  // Prevent numerical penetration below the displaced surface.
  if (nextPositionY < targetY) {
    nextPositionY = targetY;
    nextVelocityY = Math.max(0, nextVelocityY);
  } else if (nextPositionY > targetY) {
    // Damp launch when the spring overshoots above the water.
    if (nextVelocityY > 0) {
      nextVelocityY *= Math.exp(-14 * deltaSeconds);
    }
  }

  return { positionY: nextPositionY, velocityY: nextVelocityY };
}
