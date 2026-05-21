import * as THREE from 'three/webgpu';

/** Repeatable benchmark camera, prop placement, and lighting for Water Pro-style screenshots. */
export const BENCHMARK_LAYOUT = {
  camera: {
    position: new THREE.Vector3(62, 6.5, 118),
    target: new THREE.Vector3(8, 2.2, -55),
  },
  boat: {
    position: new THREE.Vector3(0, 5, -18),
    length: 17,
    width: 5.2,
    draft: 1.35,
    mass: 920,
  },
  buoy: {
    position: new THREE.Vector3(-78, 4, -98),
  },
  sun: {
    azimuthDegrees: 212,
    elevationDegrees: 26,
    intensity: 3.35,
    horizonHaze: 0.72,
    cloudStrength: 0.68,
    sunGlowStrength: 0.82,
    exposure: 1.08,
  },
  /** Windier open-ocean tuning for benchmark screenshots (Milestone 13). */
  seaState: {
    windSpeed: 16,
    choppiness: 0.56,
    swellChoppiness: 0.3,
    detailChoppiness: 0.44,
    swellAmplitudeScale: 1.05,
    detailAmplitudeScale: 2.8,
    foamThreshold: 0.17,
    foamAccumulationRate: 1.28,
    foamCoverage: 1.12,
  },
} as const;

export function applyBenchmarkCamera(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
): void {
  camera.position.copy(BENCHMARK_LAYOUT.camera.position);
  controls.target.copy(BENCHMARK_LAYOUT.camera.target);
  controls.update();
}
