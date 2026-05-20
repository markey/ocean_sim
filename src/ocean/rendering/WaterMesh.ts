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
  private readonly basePositions: Float32Array;

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
    this.basePositions = new Float32Array(
      (geometry.attributes.position as THREE.BufferAttribute).array as Float32Array,
    );
  }

  update(renderer: THREE.WebGPURenderer, surface: OceanSurfaceProvider): void {
    const displacement = surface.displacementDataTexture.image.data as Float32Array;
    const normals = surface.normalDataTexture.image.data as Float32Array;
    const positions = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const normalAttribute = this.mesh.geometry.attributes.normal as THREE.BufferAttribute;
    const positionArray = positions.array as Float32Array;
    const normalArray = normalAttribute.array as Float32Array;
    const resolution = surface.parameters.resolution;

    // PlaneGeometry is XY; local Z becomes world Y after the mesh X rotation.
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        // PlaneGeometry row order matches simulation, but V is flipped vs FFT layout.
        const simIndex = y * resolution + x;
        const vertexIndex = (resolution - 1 - y) * resolution + x;
        const pixelIndex = simIndex * 4;
        const attributeIndex = vertexIndex * 3;
        const displacementX = displacement[pixelIndex] ?? 0;
        const height = displacement[pixelIndex + 1] ?? 0;
        const displacementZ = displacement[pixelIndex + 2] ?? 0;
        const worldNormalX = ((normals[pixelIndex] ?? 0.5) - 0.5) * 2;
        const worldNormalY = ((normals[pixelIndex + 1] ?? 1) - 0.5) * 2;
        const worldNormalZ = ((normals[pixelIndex + 2] ?? 0.5) - 0.5) * 2;

        positionArray[attributeIndex] = (this.basePositions[attributeIndex] ?? 0) + displacementX;
        positionArray[attributeIndex + 1] =
          (this.basePositions[attributeIndex + 1] ?? 0) - displacementZ;
        positionArray[attributeIndex + 2] = height;

        // Convert world-space ocean normals back into the rotated plane's local space.
        normalArray[attributeIndex] = worldNormalX;
        normalArray[attributeIndex + 1] = -worldNormalZ;
        normalArray[attributeIndex + 2] = worldNormalY;
      }
    }

    positions.needsUpdate = true;
    normalAttribute.needsUpdate = true;
    void renderer;
  }

  /** Height scale is applied per cascade; kept for debug UI compatibility. */
  setHeightScale(_heightScale: number): void {}

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
