/**
 * Directional spreading D(theta): waves are strongest along the wind axis and
 * fall off with angle. Uses cos^(2s)(theta/2) (Donelan-style), where s controls
 * width: higher s = narrower wind-aligned waves, lower s = broader spread.
 *
 * The lobe is normalized by its angular average so changing s mostly redistributes
 * energy by direction instead of acting like a second amplitude slider.
 */
const NORMALIZATION_SAMPLE_COUNT = 256;
const averageCache = new Map<number, number>();

function wrapAngleRadians(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function directionalAverage(spreadPower: number): number {
  const cached = averageCache.get(spreadPower);

  if (cached !== undefined) {
    return cached;
  }

  const exponent = spreadPower * 2;
  let sum = 0;

  for (let i = 0; i < NORMALIZATION_SAMPLE_COUNT; i += 1) {
    const delta = -Math.PI + ((i + 0.5) / NORMALIZATION_SAMPLE_COUNT) * Math.PI * 2;
    const profile = Math.pow(Math.max(Math.cos(delta * 0.5), 0), exponent);

    sum += profile;
  }

  const average = sum / NORMALIZATION_SAMPLE_COUNT;
  averageCache.set(spreadPower, average);
  return average;
}

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
  const delta = wrapAngleRadians(kAngle - windDirection);
  const cosHalf = Math.cos(delta * 0.5);
  const clamped = Math.max(cosHalf, 0);
  const exponent = Math.max(spreadPower, 0.25) * 2;
  const average = directionalAverage(Math.max(spreadPower, 0.25));

  return Math.pow(clamped, exponent) / average;
}
