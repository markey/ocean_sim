import * as THREE from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  color,
  dot,
  float,
  mix,
  normalize,
  oneMinus,
  positionLocal,
  positionWorld,
  pow,
  saturate,
  texture,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import type { OceanSimulation } from '../simulation/OceanSimulation';

// Applied on top of the debug height-scale slider. Keeps 1.0 visibly wavy
// while leaving moderate headroom before seas become unrealistic.
const HEIGHT_DISPLAY_GAIN = 1.6;

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
      color: new THREE.Color(0x0d7790),
      roughness: 0.22,
      metalness: 0.02,
    });

    this.material.positionNode = Fn(() => {
      const displacement = texture(simulation.displacementDataTexture, uv()).mul(this.heightScaleUniform);
      const horizontalX = displacement.x;
      const height = displacement.y;
      const horizontalZ = displacement.z;
      // Plane lies in local XY; after mesh rotation -PI/2 around X, local Z becomes world Y.
      return positionLocal.add(vec3(horizontalX, horizontalZ.negate(), height));
    })();

    this.material.normalNode = Fn(() => {
      const worldNormal = texture(simulation.normalDataTexture, uv()).xyz.mul(2).sub(1).normalize();
      return vec3(worldNormal.x, worldNormal.z.negate(), worldNormal.y).normalize();
    })();

    this.material.colorNode = Fn(() => {
      const worldNormal = texture(simulation.normalDataTexture, uv()).xyz.mul(2).sub(1).normalize();
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

  async update(_renderer: THREE.WebGPURenderer): Promise<void> {
    // The simulation updates the DataTextures consumed by this material each frame.
  }

  setHeightScale(heightScale: number): void {
    this.heightScaleUniform.value = heightScale * HEIGHT_DISPLAY_GAIN;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
