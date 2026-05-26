/**
 * Lock a body to the rendered ocean surface with zero spring lag.
 * Vertical velocity matches the wave motion so motion stays smooth frame-to-frame.
 */
export function lockToSurfaceHeight(
  previousY: number,
  surfaceY: number,
  deltaSeconds: number,
): { positionY: number; velocityY: number } {
  const velocityY =
    deltaSeconds > 1e-6 ? (surfaceY - previousY) / deltaSeconds : 0;

  return {
    positionY: surfaceY,
    velocityY,
  };
}
