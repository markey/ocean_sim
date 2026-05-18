import * as THREE from 'three/webgpu';
import { color, positionLocal, texture, uniform, uv, vec3, wgslFn } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type { OceanSimulation } from '../simulation/OceanSimulation';

type DisplacementParams = {
  position: typeof positionLocal;
  oceanUv: ReturnType<typeof uv>;
  heightMap: Node;
  heightScale: Node;
  resolution: Node;
};

const displacePosition = wgslFn<DisplacementParams>(`
fn displacePosition(
  position: vec3<f32>,
  oceanUv: vec2<f32>,
  heightMap: texture_2d<f32>,
  heightScale: f32,
  resolution: f32
) -> vec3<f32> {
  let maxPixel = resolution - 1.0;
  let pixel = vec2<i32>(clamp(oceanUv * maxPixel, vec2<f32>(0.0), vec2<f32>(maxPixel)));
  let height = textureLoad(heightMap, pixel, 0).r * heightScale;
  return vec3<f32>(position.x, height, position.z);
}
`);

export class WaterMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardNodeMaterial;

  private readonly heightScaleUniform = uniform(1);

  constructor(simulation: OceanSimulation) {
    const geometry = new THREE.PlaneGeometry(
      simulation.parameters.patchSize,
      simulation.parameters.patchSize,
      simulation.parameters.resolution - 1,
      simulation.parameters.resolution - 1,
    );
    geometry.rotateX(-Math.PI / 2);

    this.material = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(0x1d6f86),
      roughness: 0.48,
      metalness: 0,
    });
    this.material.colorNode = color(0x0d7790);
    this.material.positionNode = displacePosition({
      position: positionLocal,
      oceanUv: uv(),
      heightMap: texture(simulation.heightTexture) as unknown as Node,
      heightScale: this.heightScaleUniform as unknown as Node,
      resolution: uniform(simulation.parameters.resolution) as unknown as Node,
    });
    this.material.normalNode = vec3(0, 1, 0);

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'FFT Water Mesh';
  }

  setHeightScale(heightScale: number): void {
    this.heightScaleUniform.value = heightScale;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
