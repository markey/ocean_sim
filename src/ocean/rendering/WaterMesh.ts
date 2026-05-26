import * as THREE from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  color,
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
  crestTranslucency: number;
  skyHazeStrength: number;
  sparkleStrength: number;
  sparkleSharpness: number;
  foamContrast: number;
  foamBrightness: number;
  foamStrength: number;
  deepWaterColor: number;
  shallowWaterColor: number;
  midWaterColor: number;
  refractedWaterColor: number;
  skyReflectionColor: number;
  subsurfaceColor: number;
  foamColor: number;
  // Sky gradient colors (kept in sync with OceanEnvironment sky dome)
  skyHorizonColor: number;
  skyLowColor: number;
  skyZenithColor: number;
  skyWarmHazeColor: number;
};

/**
 * Milestone 13 defaults — richer, more vibrant and interesting water palette.
 * Designed to look good out of the box at the benchmark camera without any GUI tweaks.
 */
export const DEFAULT_WATER_RENDERING_PARAMETERS: WaterRenderingParameters = {
  fresnelStrength: 0.88,
  reflectionStrength: 0.48,
  refractionStrength: 0.14,
  absorptionStrength: 0.19,
  scatteringStrength: 0.64,      // lively cyan crest scatter
  crestTranslucency: 0.22,
  skyHazeStrength: 0.34,          // less warm haze washing reflections to silver
  sparkleStrength: 1.35,
  sparkleSharpness: 0.58,
  foamContrast: 2.1,
  foamBrightness: 0.86,
  foamStrength: 0.54,
  deepWaterColor: 0x023858,       // rich navy — deep troughs without crushing to black
  shallowWaterColor: 0x0884b0,    // bright saturated medium blue
  midWaterColor: 0x056a8a,        // teal bridge between trough and crest
  refractedWaterColor: 0x0898b8,  // vivid refracted tint
  skyReflectionColor: 0x48a8d8,   // saturated sky blue (not washed-out silver)
  subsurfaceColor: 0x38d4f0,      // bright cyan scatter on sun-facing crests
  foamColor: 0xe8f2f8,
  // Sky gradient (coordinated with OceanEnvironment) — deeper blues, less warm wash
  skyHorizonColor: 0x5a9ec4,
  skyLowColor: 0x2d78aa,
  skyZenithColor: 0x0a1e3d,
  skyWarmHazeColor: 0xc8b498,
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
  private readonly crestTranslucencyUniform = uniform(
    DEFAULT_WATER_RENDERING_PARAMETERS.crestTranslucency,
  );
  private readonly skyHazeStrengthUniform = uniform(
    DEFAULT_WATER_RENDERING_PARAMETERS.skyHazeStrength,
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
  private readonly midWaterColorUniform = uniform(
    new THREE.Color(DEFAULT_WATER_RENDERING_PARAMETERS.midWaterColor),
  );
  private readonly refractedWaterColorUniform = uniform(
    new THREE.Color(DEFAULT_WATER_RENDERING_PARAMETERS.refractedWaterColor),
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

  // Sky gradient uniforms so water reflections match the actual sky dome
  private readonly skyHorizonColorUniform = uniform(
    new THREE.Color(DEFAULT_WATER_RENDERING_PARAMETERS.skyHorizonColor),
  );
  private readonly skyLowColorUniform = uniform(
    new THREE.Color(DEFAULT_WATER_RENDERING_PARAMETERS.skyLowColor),
  );
  private readonly skyZenithColorUniform = uniform(
    new THREE.Color(DEFAULT_WATER_RENDERING_PARAMETERS.skyZenithColor),
  );
  private readonly skyWarmHazeColorUniform = uniform(
    new THREE.Color(DEFAULT_WATER_RENDERING_PARAMETERS.skyWarmHazeColor),
  );

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
      color: new THREE.Color(0x0884b0),
      roughness: 0.14,
      metalness: 0.01,
    });
    // colorNode already bakes Fresnel, scatter, and sun glitter — skip PBR re-lighting
    this.material.lights = false;
    this.material.flatShading = false;
    this.material.transparent = true;
    this.material.depthWrite = true;

    const patchHalf = this.patchSizeUniform.mul(0.5);
    const foamTex = surface.foamDataTexture;
    const jacobianTex = surface.jacobianDataTexture;
    const normalTex = surface.normalDataTexture;
    const seaFloorY = float(-24);

    this.material.colorNode = Fn(() => {
      const worldNormal = normalWorld;
      const deepWater = this.deepWaterColorUniform;
      const midWater = this.midWaterColorUniform;
      const shallowWater = this.shallowWaterColorUniform;
      const refractedWater = this.refractedWaterColorUniform;
      const subSurface = this.subsurfaceColorUniform;
      const foamColor = this.foamColorUniform;
      const viewDirection = normalize(cameraPosition.sub(positionWorld));
      const nDotV = saturate(dot(worldNormal, viewDirection));

      // Schlick-style Fresnel: stronger grazing reflections without extra render passes.
      const fresnelBias = float(0.04);
      const fresnel = fresnelBias.add(
        oneMinus(fresnelBias).mul(pow(oneMinus(nDotV), float(5))).mul(this.fresnelStrengthUniform),
      );

      const facing = saturate(worldNormal.y.mul(0.5).add(0.5));
      const slope = oneMinus(facing);
      const waveShade = pow(saturate(slope), float(0.38));
      // Steep trough faces read as deeper, darker water for strong blue variation.
      const troughShade = pow(oneMinus(saturate(worldNormal.y)), float(1.35));
      const waterDepth = max(positionWorld.y.sub(seaFloorY), float(0.1));
      const absorption = oneMinus(exp(waterDepth.mul(this.absorptionStrengthUniform).mul(-1)));
      const depthColor = mix(
        shallowWater,
        deepWater,
        saturate(absorption.add(troughShade.mul(0.34))),
      );
      const baseColor = mix(depthColor, midWater, saturate(waveShade.mul(0.55)));
      const troughColor = mix(baseColor, deepWater, troughShade.mul(0.46));

      const sunDirection = normalize(vec3(this.sunDirectionUniform));
      const sunFacing = pow(saturate(dot(worldNormal, sunDirection)), float(2.0));
      const crestScatter = sunFacing.mul(waveShade).mul(this.scatteringStrengthUniform);
      const scattered = mix(troughColor, subSurface, saturate(crestScatter));

      const foamUv = vec2(
        positionWorld.x.add(patchHalf).div(this.patchSizeUniform),
        positionWorld.z.add(patchHalf).div(this.patchSizeUniform),
      );
      const simulatedNormalSample = texture(normalTex, foamUv);
      const simulatedNormal = normalize(
        simulatedNormalSample.rgb.mul(2).sub(1),
      );
      const simSlope = oneMinus(saturate(simulatedNormal.y));
      const jacobianSample = texture(jacobianTex, foamUv);
      const compression = jacobianSample.g;

      const refractUv = screenUV.add(
        simulatedNormal.xz.mul(this.refractionStrengthUniform).mul(float(0.026)),
      );
      const refractedScene = viewportSharedTexture(refractUv).rgb;
      const refracted = mix(refractedScene, refractedWater, saturate(absorption.mul(0.88)));
      const reflectionVector = reflect(viewDirection.mul(float(-1)), worldNormal);
      const skyDir = normalize(reflectionVector);
      const skyHeight = saturate(skyDir.y.mul(0.58).add(0.42));
      const skyHorizon = this.skyHorizonColorUniform;
      const skyLow = this.skyLowColorUniform;
      const skyZenith = this.skyZenithColorUniform;
      const skyWarmHaze = this.skyWarmHazeColorUniform;
      const skyGradient = mix(
        mix(skyHorizon, skyLow, skyHeight),
        skyZenith,
        pow(skyHeight, float(1.72)),
      );
      const skySunAlignment = pow(saturate(dot(skyDir, sunDirection)), float(42));
      const skyHorizonHaze = pow(saturate(float(1).sub(skyHeight)), float(2.15)).mul(
        this.skyHazeStrengthUniform,
      );
      const reflectedSky = mix(
        skyGradient,
        skyWarmHaze,
        saturate(skyHorizonHaze.mul(0.48).add(skySunAlignment.mul(0.32))),
      );
      const skyTint = this.skyReflectionColorUniform;
      const bodyColor = mix(scattered, refracted, this.refractionStrengthUniform.mul(0.16));
      const skyReflection = mix(reflectedSky, skyTint, float(0.05));
      const reflected = mix(
        bodyColor,
        skyReflection,
        saturate(fresnel.mul(this.reflectionStrengthUniform).mul(0.82)),
      );

      // Sun glitter from simulated normals, slope, and Jacobian compression (no scrolling noise).
      const sunReflection = reflect(sunDirection.mul(float(-1)), worldNormal);
      const glintPower = mix(float(120), float(480), saturate(this.sparkleSharpnessUniform));
      const glintBase = pow(saturate(dot(sunReflection, viewDirection)), glintPower);
      const crestFacet = pow(saturate(simSlope.mul(float(2.8))), float(2.4));
      const foldSparkle = pow(saturate(compression.mul(float(2.4))), float(3.6));
      const normalSparkle = pow(
        saturate(
          dot(simulatedNormal, sunDirection).mul(simSlope).add(saturate(simulatedNormal.y)),
        ),
        float(4.2),
      );
      const sparkle = glintBase
        .mul(crestFacet.mul(0.55).add(foldSparkle.mul(0.35)).add(normalSparkle.mul(0.22)))
        .mul(this.sparkleStrengthUniform);

      const accumulatedFoam = texture(foamTex, foamUv).r;
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

      const crestGlow = subSurface.mul(crestScatter.mul(0.68));
      const ambientFill = mix(deepWater, shallowWater, float(0.38)).mul(float(0.12));
      const vibrantWater = reflected.add(color(0xf8fdff).mul(sparkle)).add(crestGlow).add(ambientFill);
      return mix(vibrantWater, litFoam, saturate(foamMask));
    })();

    this.material.roughnessNode = Fn(() => {
      const viewDirection = normalize(cameraPosition.sub(positionWorld));
      const fresnel = oneMinus(saturate(dot(normalWorld, viewDirection)));
      return mix(
        float(0.3),
        float(0.06),
        saturate(fresnel.add(this.sparkleStrengthUniform.mul(0.16))),
      );
    })();
    this.material.opacityNode = Fn(() => {
      const viewDirection = normalize(cameraPosition.sub(positionWorld));
      const fresnel = pow(oneMinus(saturate(dot(normalWorld, viewDirection))), float(3));
      const crestFacing = oneMinus(saturate(normalWorld.y));
      const translucency = crestFacing.mul(this.crestTranslucencyUniform);
      return mix(
        float(0.86),
        float(0.98),
        saturate(fresnel.add(this.fresnelStrengthUniform.mul(0.18)).add(translucency)),
      );
    })();
    this.material.backdropNode = Fn(() => {
      const refractUv = screenUV.add(
        normalWorld.xz.mul(this.refractionStrengthUniform).mul(float(0.018)),
      );
      // Cooler underwater tint to match the new vibrant blue ocean palette
      const underwaterTint = color(0x042840);
      return mix(viewportSharedTexture(refractUv).rgb, underwaterTint, float(0.48));
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

  updateRendering(sunDirection: THREE.Vector3): void {
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
    if (next.crestTranslucency !== undefined) {
      this.crestTranslucencyUniform.value = next.crestTranslucency;
    }
    if (next.skyHazeStrength !== undefined) {
      this.skyHazeStrengthUniform.value = next.skyHazeStrength;
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
    if (next.midWaterColor !== undefined) {
      this.midWaterColorUniform.value.set(next.midWaterColor);
    }
    if (next.refractedWaterColor !== undefined) {
      this.refractedWaterColorUniform.value.set(next.refractedWaterColor);
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
    if (next.skyHorizonColor !== undefined) {
      this.skyHorizonColorUniform.value.set(next.skyHorizonColor);
    }
    if (next.skyLowColor !== undefined) {
      this.skyLowColorUniform.value.set(next.skyLowColor);
    }
    if (next.skyZenithColor !== undefined) {
      this.skyZenithColorUniform.value.set(next.skyZenithColor);
    }
    if (next.skyWarmHazeColor !== undefined) {
      this.skyWarmHazeColorUniform.value.set(next.skyWarmHazeColor);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
