/** Tunable buoyancy response for floating bodies. */
export type BuoyancyParameters = {
  /** Spring strength pulling the body toward the sampled water height (N/m). */
  verticalStiffness: number;
  /**
   * Damping as a fraction of critical damping (√(k·m)).
   * 1 = no overshoot; >1 settles faster; <1 bounces.
   */
  dampingRatio: number;
  /** How quickly the target height follows wave motion (1/s). */
  heightFollowRate: number;
  /** Horizontal velocity damping (1/s). */
  linearDrag: number;
  /** How quickly orientation aligns to the sampled surface normal (1/s). */
  orientationBlend: number;
};

export const DEFAULT_BUOYANCY_PARAMETERS: BuoyancyParameters = {
  verticalStiffness: 38,
  dampingRatio: 1.05,
  heightFollowRate: 6,
  linearDrag: 1.2,
  orientationBlend: 4.5,
};
