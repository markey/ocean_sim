import * as THREE from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  color,
  dot,
  float,
  max,
  mix,
  normalWorld,
  normalize,
  oneMinus,
  positionWorld,
  pow,
  saturate,
  texture,
  uniform,
  vec2,
} from 'three/tsl';
import type { OceanSurfaceProvider } from '../simulation/OceanSurfaceProvider';

export class WaterMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardNodeMaterial;
  private readonly basePositions: Float32Array;
  private readonly resolution: number;
  private readonly patchSizeUniform = uniform(160);
  private readonly foamStrengthUniform = uniform(1.35);

  constructor(surface: OceanSurfaceProvider) {
    const { resolution, patchSize } = surface.parameters;
    this.resolution = resolution;
    this.patchSizeUniform.value = patchSize;
    const geometry = new THREE.PlaneGeometry(
      patchSize,
      patchSize,
      resolution - 1,
      resolution - 1,
    );

    this.material = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(0x0d7790),
      roughness: 0.28,
      metalness: 0.01,
    });
    this.material.flatShading = true;

    const patchHalf = this.patchSizeUniform.mul(0.5);
    const foamTex = surface.foamDataTexture;
    const jacobianTex = surface.jacobianDataTexture;

    this.material.colorNode = Fn(() => {
      const worldNormal = normalWorld;
      const deepWater = color(0x0a5f73);
      const shallowWater = color(0x1f9db8);
      const skyReflection = color(0xb8dff0);
      const foamColor = color(0xf2f8fc);
      const viewDirection = normalize(cameraPosition.sub(positionWorld));
      const fresnel = pow(oneMinus(saturate(dot(worldNormal, viewDirection))), float(4));
      const facing = saturate(worldNormal.y.mul(0.5).add(0.5));
      const slope = oneMinus(facing);
      const waveShade = pow(saturate(slope), float(0.55));
      const baseColor = mix(deepWater, shallowWater, facing.mul(0.45).add(waveShade.mul(0.55)));
      const reflected = mix(baseColor, skyReflection, fresnel.mul(0.45));

      // World XZ → simulation UV (repeat-wrapped foam field).
      const foamUv = vec2(
        positionWorld.x.add(patchHalf).div(this.patchSizeUniform),
        positionWorld.z.add(patchHalf).div(this.patchSizeUniform),
      );
      const accumulatedFoam = texture(foamTex, foamUv).r.mul(this.foamStrengthUniform);
      const jacobianSample = texture(jacobianTex, foamUv);
      const compression = jacobianSample.g;
      const instantFoam = pow(saturate(compression.mul(float(3.2))), float(1.4));
      const foamMask = max(
        pow(saturate(accumulatedFoam), float(0.7)),
        instantFoam,
      ).mul(pow(saturate(worldNormal.y), float(0.2)));

      return mix(reflected, foamColor, saturate(foamMask));
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

  /**
   * World-space water height at (worldX, worldZ) from the displaced mesh vertices.
   * Matches the rendered surface used by buoyancy (call after {@link update}).
   */
  sampleWorldHeight(worldX: number, worldZ: number): number {
    const positionAttribute = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const positions = positionAttribute.array as Float32Array;
    const patchSize = this.patchSizeUniform.value;
    const resolution = this.resolution;
    const halfPatch = patchSize * 0.5;
    const wrappedU = (worldX + halfPatch) / patchSize - Math.floor((worldX + halfPatch) / patchSize);
    const wrappedV = (worldZ + halfPatch) / patchSize - Math.floor((worldZ + halfPatch) / patchSize);
    const su = wrappedU * (resolution - 1);
    const sv = wrappedV * (resolution - 1);
    const x0 = Math.floor(su);
    const y0 = Math.floor(sv);
    const x1 = Math.min(x0 + 1, resolution - 1);
    const y1 = Math.min(y0 + 1, resolution - 1);
    const fu = su - x0;
    const fv = sv - y0;

    const readWorldY = (simX: number, simY: number) => {
      const vertexIndex = (resolution - 1 - simY) * resolution + simX;
      return positions[vertexIndex * 3 + 2] ?? 0;
    };

    const h00 = readWorldY(x0, y0);
    const h10 = readWorldY(x1, y0);
    const h01 = readWorldY(x0, y1);
    const h11 = readWorldY(x1, y1);
    const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

    return lerp(lerp(h00, h10, fu), lerp(h01, h11, fu), fv);
  }

  /** Height scale is applied per cascade; kept for debug UI compatibility. */
  setHeightScale(_heightScale: number): void {}

  setPatchSize(patchSize: number): void {
    this.patchSizeUniform.value = patchSize;
  }

  setFoamStrength(strength: number): void {
    this.foamStrengthUniform.value = strength;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
