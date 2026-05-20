import * as THREE from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  color,
  dot,
  float,
  mix,
  normalWorld,
  normalize,
  oneMinus,
  positionWorld,
  pow,
  saturate,
} from 'three/tsl';
import type { OceanSurfaceProvider } from '../simulation/OceanSurfaceProvider';

export class WaterMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardNodeMaterial;

  constructor(surface: OceanSurfaceProvider) {
    const { resolution, patchSize } = surface.parameters;
    const geometry = new THREE.PlaneGeometry(
      patchSize,
      patchSize,
      resolution - 1,
      resolution - 1,
    );

    this.material = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(0x0d7790),
      roughness: 0.22,
      metalness: 0.02,
    });

    this.material.colorNode = Fn(() => {
      const worldNormal = normalWorld;
      const deepWater = color(0x0a5f73);
      const shallowWater = color(0x1f9db8);
      const skyReflection = color(0xb8dff0);
      const viewDirection = normalize(cameraPosition.sub(positionWorld));
      const fresnel = pow(oneMinus(saturate(dot(worldNormal, viewDirection))), float(4));
      const facing = saturate(worldNormal.y.mul(0.5).add(0.5));
      const baseColor = mix(deepWater, shallowWater, facing);
      return mix(baseColor, skyReflection, fresnel.mul(0.55));
    })();

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'FFT Water Mesh';
    this.mesh.rotation.x = -Math.PI / 2;
  }

  update(renderer: THREE.WebGPURenderer, surface: OceanSurfaceProvider): void {
    const displacement = surface.displacementDataTexture.image.data as Float32Array;
    const positions = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const resolution = surface.parameters.resolution;

    // PlaneGeometry is XY; local Z becomes world Y after the mesh X rotation.
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        // PlaneGeometry row order matches simulation, but V is flipped vs FFT layout.
        const simIndex = y * resolution + x;
        const vertexIndex = (resolution - 1 - y) * resolution + x;
        const height = displacement[simIndex * 4 + 1] ?? 0;
        positions.setZ(vertexIndex, height);
      }
    }

    positions.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    void renderer;
    void surface;
  }

  /** Height scale is applied per cascade; kept for debug UI compatibility. */
  setHeightScale(_heightScale: number): void {}

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
