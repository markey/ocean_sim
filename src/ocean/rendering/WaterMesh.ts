import * as THREE from 'three/webgpu';
import {
  Fn,
  attributeArray,
  color,
  compute,
  float,
  instanceIndex,
  ivec2,
  storageTexture,
  textureLoad,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
import type Node from 'three/src/nodes/core/Node.js';
import type { OceanSimulation } from '../simulation/OceanSimulation';

export class WaterMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardNodeMaterial;

  private readonly heightScaleUniform = uniform(1);
  private readonly positionBuffer: Node;
  private readonly updatePositionsNode: ComputeNode;

  constructor(simulation: OceanSimulation) {
    const resolution = simulation.parameters.resolution;
    const vertexCount = resolution * resolution;
    const geometry = new THREE.PlaneGeometry(
      simulation.parameters.patchSize,
      simulation.parameters.patchSize,
      resolution - 1,
      resolution - 1,
    );

    this.positionBuffer = attributeArray(vertexCount, 'vec3') as unknown as Node;
    this.updatePositionsNode = this.createUpdatePositionsNode(simulation);

    this.material = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(0x1d6f86),
      roughness: 0.48,
      metalness: 0,
    });
    this.material.colorNode = color(0x0d7790);
    this.material.positionNode = (this.positionBuffer as Node & { toAttribute: () => Node }).toAttribute();
    this.material.normalNode = vec3(0, 1, 0);

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'FFT Water Mesh';
  }

  async update(renderer: THREE.WebGPURenderer): Promise<void> {
    await renderer.computeAsync(this.updatePositionsNode);
  }

  setHeightScale(heightScale: number): void {
    this.heightScaleUniform.value = heightScale;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }

  private createUpdatePositionsNode(simulation: OceanSimulation): ComputeNode {
    const resolution = uniform(simulation.parameters.resolution, 'uint' as 'float') as unknown as Node;
    const resolutionFloat = uniform(simulation.parameters.resolution);
    const patchSize = uniform(simulation.parameters.patchSize);
    const heightMap = storageTexture(simulation.heightTexture).toReadOnly();

    // GPU data flow: this pass converts the FFT height texture into the vertex
    // position buffer consumed by the water material on the same WebGPU device.
    return compute(
      Fn(() => {
        const xIndex = (instanceIndex as any).mod(resolution);
        const zIndex = (instanceIndex as any).div(resolution);
        const gridUv = vec2(float(xIndex), float(zIndex)).div(resolutionFloat.sub(1));
        const centered = gridUv.sub(0.5).mul(patchSize);
        const height = textureLoad(heightMap, ivec2(xIndex as any, zIndex as any)).r.mul(this.heightScaleUniform);

        (this.positionBuffer as Node & { element: (index: Node) => Node }).element(instanceIndex).assign(
          vec3(centered.x, height, centered.y),
        );
      })(),
      simulation.parameters.resolution * simulation.parameters.resolution,
      [64],
    );
  }
}
