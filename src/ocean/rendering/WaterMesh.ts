import * as THREE from 'three/webgpu';
import {
  Fn,
  color,
  convertToTexture,
  floor,
  ivec2,
  positionLocal,
  storageTexture,
  texture,
  textureLoad,
  uniform,
  uv,
  vec3,
  vec4,
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

    const resolutionFloat = uniform(simulation.parameters.resolution);
    const heightStorage = storageTexture(simulation.heightTexture).toReadOnly();
    // WebGPU vertex shaders cannot sample storage textures; copy to a regular texture first.
    const heightCopy = Fn(() => {
      const texel = ivec2(
        floor(uv().x.mul(resolutionFloat)) as any,
        floor(uv().y.mul(resolutionFloat)) as any,
      );
      const sample = textureLoad(heightStorage, texel);
      return vec4(sample.r, sample.g, sample.b, 1);
    });
    const heightMap = convertToTexture(heightCopy(), resolution, resolution);

    this.material = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(0x1d6f86),
      roughness: 0.48,
      metalness: 0,
    });
    this.material.colorNode = color(0x0d7790);
    this.material.positionNode = Fn(() => {
      const height = texture(heightMap, uv()).r.mul(this.heightScaleUniform);
      // Plane lies in local XY; after mesh rotation -PI/2 around X, local Z becomes world Y.
      return positionLocal.add(vec3(0, 0, height));
    })();
    this.material.normalNode = vec3(0, 1, 0);

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'FFT Water Mesh';
    this.mesh.rotation.x = -Math.PI / 2;
  }

  async update(_renderer: THREE.WebGPURenderer): Promise<void> {
    // Height is copied to a sampleable texture automatically before each render via convertToTexture().
  }

  setHeightScale(heightScale: number): void {
    this.heightScaleUniform.value = heightScale;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
