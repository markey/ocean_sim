import * as THREE from 'three/webgpu';

/** Repeatable benchmark camera, prop placement, and lighting for Water Pro-style screenshots. */
export const BENCHMARK_LAYOUT = {
  camera: {
    position: new THREE.Vector3(48, 7.2, 72),
    target: new THREE.Vector3(-4, 2.8, -24),
  },
  boat: {
    position: new THREE.Vector3(-2, 5, -20),
    length: 17,
    width: 5.2,
    draft: 1.35,
    mass: 920,
  },
  buoy: {
    position: new THREE.Vector3(-68, 4, -82),
  },
  sun: {
    azimuthDegrees: 212,
    elevationDegrees: 26,
    intensity: 3.15,
    horizonHaze: 0.58,
    exposure: 1.04,
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
