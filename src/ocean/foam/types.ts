/** Tunable crest-foam simulation (Jacobian-driven accumulation + decay). */
export type FoamParameters = {
  enabled: boolean;
  /**
   * Compression signal (1 − J) must exceed this before foam deposits.
   * Lower values foam earlier; higher values restrict to sharper folds.
   */
  threshold: number;
  /** How quickly foam builds when breaking (units: 1/s). */
  accumulationRate: number;
  /** Exponential decay rate of stored foam (units: 1/s). */
  decayRate: number;
  /** Multiplier on the compression signal before thresholding. */
  coverage: number;
};

export const DEFAULT_FOAM_PARAMETERS: FoamParameters = {
  enabled: true,
  threshold: 0.14,
  accumulationRate: 2.2,
  decayRate: 0.45,
  coverage: 2.2,
};
