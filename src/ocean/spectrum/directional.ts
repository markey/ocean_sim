/**
 * Directional spreading D(theta): waves are strongest along the wind axis and
 * fall off with angle. Uses cos^(2s)(theta/2) (Donelan-style), where s controls
 * width — higher s = narrower beam, lower s = broader spread.
 */
export function directionalSpreading(
  kx: number,
  kz: number,
  windDirection: number,
  spreadPower: number,
): number {
  const kLengthSq = kx * kx + kz * kz;

  if (kLengthSq < 1e-12) {
    return 0;
  }

  const kAngle = Math.atan2(kz, kx);
  const delta = kAngle - windDirection;
  const cosHalf = Math.cos(delta * 0.5);
  const clamped = Math.max(cosHalf, 0);
  const exponent = Math.max(spreadPower, 0.25) * 2;

  // Hemisphere normalization constant for cos^(2s)(theta/2); approximate but stable.
  const normalization = 0.5 * Math.PI * Math.pow(0.5, 2 * Math.max(spreadPower, 0.25));

  return Math.pow(clamped, exponent) / normalization;
}
