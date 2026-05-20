import * as THREE from 'three/webgpu';
import {
  Fn,
  color,
  positionLocal,
  texture,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import type { OceanSimulation } from '../simulation/OceanSimulation';

export class WaterMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardNodeMaterial;

  private readonly heightScaleUniform = uniform(1);

  constructor(simulation: OceanSimulation) {
    const resolution = simulation.parameters.resolution;
    const geometry = new THREE.PlaneGeometry(
      simulation.parameters.patchSize,
      simulation.parameters.patchSize,
      resolution - 1,
      resolution - 1,
    );

    this.material = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(0x1d6f86),
      roughness: 0.48,
      metalness: 0,
    });
    this.material.colorNode = color(0x0d7790);
    this.material.positionNode = Fn(() => {
      const height = texture(simulation.heightDataTexture, uv()).r.mul(this.heightScaleUniform);
      // Plane lies in local XY; after mesh rotation -PI/2 around X, local Z becomes world Y.
      return positionLocal.add(vec3(0, 0, height));
    })();
    this.material.normalNode = vec3(0, 1, 0);

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'FFT Water Mesh';
    this.mesh.rotation.x = -Math.PI / 2;
  }

  async update(_renderer: THREE.WebGPURenderer): Promise<void> {
    // The simulation updates the DataTexture backing this material each frame.
  }

  setHeightScale(heightScale: number): void {
    this.heightScaleUniform.value = heightScale;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
