import * as THREE from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  color,
  cos,
  dot,
  exp,
  float,
  max,
  mix,
  normalWorld,
  normalize,
  oneMinus,
  positionWorld,
  pow,
  reflect,
  saturate,
  screenUV,
  sin,
  texture,
  uniform,
  vec2,
  vec3,
  viewportSharedTexture,
} from 'three/tsl';
import type { OceanSurfaceProvider } from '../simulation/OceanSurfaceProvider';

export type WaterRenderingParameters = {
  fresnelStrength: number;
  reflectionStrength: number;
  refractionStrength: number;
  absorptionStrength: number;
  scatteringStrength: number;
  sparkleStrength: number;
  sparkleSharpness: number;
  foamContrast: number;
  foamBrightness: number;
  foamStrength: number;
  deepWaterColor: number;
  shallowWaterColor: number;
  skyReflectionColor: number;
  subsurfaceColor: number;
  foamColor: number;
};

export const DEFAULT_WATER_RENDERING_PARAMETERS: WaterRenderingParameters = {
  fresnelStrength: 1.02,
  reflectionStrength: 0.76,
  refractionStrength: 0.22,
  absorptionStrength: 0.092,
  scatteringStrength: 0.28,
  sparkleStrength: 1.22,
  sparkleSharpness: 0.66,
  foamContrast: 2,
  foamBrightness: 0.82,
  foamStrength: 0.5,
  deepWaterColor: 0x03384f,
  shallowWaterColor: 0x1aa9a7,
  skyReflectionColor: 0x9fc5df,
  subsurfaceColor: 0x50d4bd,
  foamColor: 0xe8f2ee,
};

export class WaterMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardNodeMaterial;
  private readonly basePositions: Float32Array;
  private readonly resolution: number;
  private readonly patchSizeUniform = uniform(640);
  private readonly foamStrengthUniform = uniform(DEFAULT_WATER_RENDERING_PARAMETERS.foamStrength);
  private readonly fresnelStrengthUniform = uniform(
    DEFAULT_WATER_RENDERING_PARAMETERS.fresnelStrength,
  );
  private readonly reflectionStrengthUniform = uniform(
    DEFAULT_WATER_RENDERING_PARAMETERS.reflectionStrength,
  );
  private readonly refractionStrengthUniform = uniform(
    DEFAULT_WATER_RENDERING_PARAMETERS.refractionStrength,
  );
  private readonly absorptionStrengthUniform = uniform(
    DEFAULT_WATER_RENDERING_PARAMETERS.absorptionStrength,
  );
  private readonly scatteringStrengthUniform = uniform(
    DEFAULT_WATER_RENDERING_PARAMETERS.scatteringStrength,
  );
  private readonly sparkleStrengthUniform = uniform(
    DEFAULT_WATER_RENDERING_PARAMETERS.sparkleStrength,
  );
  private readonly sparkleSharpnessUniform = uniform(
    DEFAULT_WATER_RENDERING_PARAMETERS.sparkleSharpness,
  );
  private readonly foamContrastUniform = uniform(DEFAULT_WATER_RENDERING_PARAMETERS.foamContrast);
  private readonly foamBrightnessUniform = uniform(
    DEFAULT_WATER_RENDERING_PARAMETERS.foamBrightness,
  );
  private readonly deepWaterColorUniform = uniform(
    new THREE.Color(DEFAULT_WATER_RENDERING_PARAMETERS.deepWaterColor),
  );
  private readonly shallowWaterColorUniform = uniform(
    new THREE.Color(DEFAULT_WATER_RENDERING_PARAMETERS.shallowWaterColor),
  );
  private readonly skyReflectionColorUniform = uniform(
    new THREE.Color(DEFAULT_WATER_RENDERING_PARAMETERS.skyReflectionColor),
  );
  private readonly subsurfaceColorUniform = uniform(
    new THREE.Color(DEFAULT_WATER_RENDERING_PARAMETERS.subsurfaceColor),
  );
  private readonly foamColorUniform = uniform(
    new THREE.Color(DEFAULT_WATER_RENDERING_PARAMETERS.foamColor),
  );
  private readonly timeUniform = uniform(0);
  private readonly sunDirectionUniform = uniform(new THREE.Vector3(0.52, 0.78, 0.34).normalize());

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
      color: new THREE.Color(0x075f78),
      roughness: 0.18,
      metalness: 0.01,
    });
    this.material.flatShading = false;
    this.material.transparent = true;
    this.material.depthWrite = true;

    const patchHalf = this.patchSizeUniform.mul(0.5);
    const foamTex = surface.foamDataTexture;
    const jacobianTex = surface.jacobianDataTexture;
    const seaFloorY = float(-24);

    this.material.colorNode = Fn(() => {
      const worldNormal = normalWorld;
      const deepWater = this.deepWaterColorUniform;
      const midWater = color(0x076f84);
      const shallowWater = this.shallowWaterColorUniform;
      const refractedWater = color(0x1b8d8a);
      const skyReflection = this.skyReflectionColorUniform;
      const subSurface = this.subsurfaceColorUniform;
      const foamColor = this.foamColorUniform;
      const viewDirection = normalize(cameraPosition.sub(positionWorld));
      const edgeFacing = oneMinus(saturate(dot(worldNormal, viewDirection)));
      const fresnel = pow(edgeFacing, float(4.4)).mul(this.fresnelStrengthUniform);
      const facing = saturate(worldNormal.y.mul(0.5).add(0.5));
      const slope = oneMinus(facing);
      const waveShade = pow(saturate(slope), float(0.55));
      const waterDepth = max(positionWorld.y.sub(seaFloorY), float(0.1));
      const absorption = oneMinus(exp(waterDepth.mul(this.absorptionStrengthUniform).mul(-1)));
      const depthColor = mix(shallowWater, deepWater, saturate(absorption));
      const baseColor = mix(depthColor, midWater, saturate(waveShade.mul(0.22)));

      // Approximate forward subsurface scatter where thin crests face the sun.
      const sunDirection = normalize(vec3(this.sunDirectionUniform));
      const sunFacing = pow(saturate(dot(worldNormal, sunDirection)), float(2.6));
      const crestScatter = sunFacing.mul(waveShade).mul(this.scatteringStrengthUniform);
      const scattered = mix(baseColor, subSurface, saturate(crestScatter));

      // Screen-space refraction is a lightweight placeholder: distort the opaque viewport
      // by the simulated normal, then attenuate it by the same water-column absorption.
      const refractUv = screenUV.add(
        worldNormal.xz.mul(this.refractionStrengthUniform).mul(float(0.028)),
      );
      const refractedScene = viewportSharedTexture(refractUv).rgb;
      const refracted = mix(refractedScene, refractedWater, saturate(absorption.mul(0.75)));
      const reflectionVector = reflect(viewDirection.mul(float(-1)), worldNormal);
      const skyFacing = pow(saturate(reflectionVector.y.mul(0.5).add(0.5)), float(0.58));
      const horizonReflection = mix(skyReflection, color(0xf4d6af), saturate(edgeFacing.mul(0.45)));
      const reflectedSky = mix(horizonReflection, color(0x547eaa), skyFacing);
      const reflected = mix(
        mix(scattered, refracted, this.refractionStrengthUniform.mul(0.32)),
        reflectedSky,
        saturate(fresnel.mul(this.reflectionStrengthUniform)),
      );

      const sunReflection = reflect(sunDirection.mul(float(-1)), worldNormal);
      const glintPower = mix(float(140), float(520), saturate(this.sparkleSharpnessUniform));
      const glintBase = pow(saturate(dot(sunReflection, viewDirection)), glintPower);
      const crestMicroFacet = pow(saturate(slope.mul(float(2.4))), float(3.2));
      const simulatedFacetBreakup = pow(
        saturate(
          sin(positionWorld.x.mul(17).add(this.timeUniform.mul(3.1)))
            .mul(cos(positionWorld.z.mul(21).sub(this.timeUniform.mul(2.7))))
            .mul(0.5)
            .add(0.5),
        ),
        float(9),
      );
      const sparkle = glintBase
        .mul(mix(crestMicroFacet, crestMicroFacet.mul(simulatedFacetBreakup), float(0.35)))
        .mul(this.sparkleStrengthUniform);

      // World XZ → simulation UV (repeat-wrapped foam field).
      const foamUv = vec2(
        positionWorld.x.add(patchHalf).div(this.patchSizeUniform),
        positionWorld.z.add(patchHalf).div(this.patchSizeUniform),
      );
      const accumulatedFoam = texture(foamTex, foamUv).r;
      const jacobianSample = texture(jacobianTex, foamUv);
      const compression = jacobianSample.g;
      const instantFoam = pow(saturate(compression.mul(float(2.15))), float(2.75));
      const rawFoam = max(
        pow(saturate(accumulatedFoam), float(1.35)).mul(float(0.72)),
        instantFoam.mul(float(0.48)),
      );
      const litFoam = foamColor.mul(
        mix(float(0.56), this.foamBrightnessUniform, saturate(dot(worldNormal, sunDirection))),
      );
      const foamMask = pow(saturate(rawFoam), this.foamContrastUniform)
        .mul(this.foamStrengthUniform)
        .mul(pow(saturate(worldNormal.y), float(0.45)));

      return mix(reflected.add(color(0xf5fbff).mul(sparkle)), litFoam, saturate(foamMask));
    })();

    this.material.roughnessNode = Fn(() => {
      const viewDirection = normalize(cameraPosition.sub(positionWorld));
      const fresnel = oneMinus(saturate(dot(normalWorld, viewDirection)));
      return mix(
        float(0.32),
        float(0.07),
        saturate(fresnel.add(this.sparkleStrengthUniform.mul(0.18))),
      );
    })();
    this.material.opacityNode = Fn(() => {
      const viewDirection = normalize(cameraPosition.sub(positionWorld));
      const fresnel = pow(oneMinus(saturate(dot(normalWorld, viewDirection))), float(3));
      return mix(
        float(0.88),
        float(0.97),
        saturate(fresnel.add(this.fresnelStrengthUniform.mul(0.2))),
      );
    })();
    this.material.backdropNode = Fn(() => {
      const refractUv = screenUV.add(
        normalWorld.xz.mul(this.refractionStrengthUniform).mul(float(0.018)),
      );
      const underwaterTint = color(0x07566a);
      return mix(viewportSharedTexture(refractUv).rgb, underwaterTint, float(0.34));
    })();
    this.material.backdropAlphaNode = this.refractionStrengthUniform.mul(0.28);

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

  updateRendering(timeSeconds: number, sunDirection: THREE.Vector3): void {
    this.timeUniform.value = timeSeconds;
    this.sunDirectionUniform.value.copy(sunDirection).normalize();
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

  setRenderingParameters(next: Partial<WaterRenderingParameters>): void {
    if (next.fresnelStrength !== undefined) {
      this.fresnelStrengthUniform.value = next.fresnelStrength;
    }
    if (next.reflectionStrength !== undefined) {
      this.reflectionStrengthUniform.value = next.reflectionStrength;
    }
    if (next.refractionStrength !== undefined) {
      this.refractionStrengthUniform.value = next.refractionStrength;
    }
    if (next.absorptionStrength !== undefined) {
      this.absorptionStrengthUniform.value = next.absorptionStrength;
    }
    if (next.scatteringStrength !== undefined) {
      this.scatteringStrengthUniform.value = next.scatteringStrength;
    }
    if (next.sparkleStrength !== undefined) {
      this.sparkleStrengthUniform.value = next.sparkleStrength;
    }
    if (next.sparkleSharpness !== undefined) {
      this.sparkleSharpnessUniform.value = next.sparkleSharpness;
    }
    if (next.foamContrast !== undefined) {
      this.foamContrastUniform.value = next.foamContrast;
    }
    if (next.foamBrightness !== undefined) {
      this.foamBrightnessUniform.value = next.foamBrightness;
    }
    if (next.foamStrength !== undefined) {
      this.setFoamStrength(next.foamStrength);
    }
    if (next.deepWaterColor !== undefined) {
      this.deepWaterColorUniform.value.set(next.deepWaterColor);
    }
    if (next.shallowWaterColor !== undefined) {
      this.shallowWaterColorUniform.value.set(next.shallowWaterColor);
    }
    if (next.skyReflectionColor !== undefined) {
      this.skyReflectionColorUniform.value.set(next.skyReflectionColor);
    }
    if (next.subsurfaceColor !== undefined) {
      this.subsurfaceColorUniform.value.set(next.subsurfaceColor);
    }
    if (next.foamColor !== undefined) {
      this.foamColorUniform.value.set(next.foamColor);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
