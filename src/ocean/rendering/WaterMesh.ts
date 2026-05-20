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
  uv,
  vec3,
} from 'three/tsl';
import type { OceanSurfaceProvider } from '../simulation/OceanSurfaceProvider';

export class WaterMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardNodeMaterial;

  constructor(surface: OceanSurfaceProvider) {
    const resolution = surface.parameters.resolution;
    const geometry = new THREE.PlaneGeometry(
      surface.parameters.patchSize,
      surface.parameters.patchSize,
      resolution - 1,
      resolution - 1,
    );

    this.material = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(0x0d7790),
      roughness: 0.22,
      metalness: 0.02,
    });

    this.material.positionNode = Fn(() => {
      const displacement = texture(surface.displacementDataTexture, uv());
      const horizontalX = displacement.x;
      const height = displacement.y;
      const horizontalZ = displacement.z;
      // Plane lies in local XY; after mesh rotation -PI/2 around X, local Z becomes world Y.
      return positionLocal.add(vec3(horizontalX, horizontalZ.negate(), height));
    })();

    this.material.normalNode = Fn(() => {
      const worldNormal = texture(surface.normalDataTexture, uv()).xyz.mul(2).sub(1).normalize();
      return vec3(worldNormal.x, worldNormal.z.negate(), worldNormal.y).normalize();
    })();

    this.material.colorNode = Fn(() => {
      const worldNormal = texture(surface.normalDataTexture, uv()).xyz.mul(2).sub(1).normalize();
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
    // The cascade system updates the DataTextures consumed by this material each frame.
  }

  /** Height scale is applied per cascade; kept for debug UI compatibility. */
  setHeightScale(_heightScale: number): void {}

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
