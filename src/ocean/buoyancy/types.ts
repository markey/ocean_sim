/** Tunable buoyancy response for floating bodies. */
export type BuoyancyParameters = {
  /** Horizontal velocity damping (1/s). */
  linearDrag: number;
  /** How quickly orientation aligns to the sampled surface normal (1/s). */
  orientationBlend: number;
};

export const DEFAULT_BUOYANCY_PARAMETERS: BuoyancyParameters = {
  linearDrag: 1.2,
  orientationBlend: 12,
};
