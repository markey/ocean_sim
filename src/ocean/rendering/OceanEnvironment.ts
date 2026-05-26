import * as THREE from 'three/webgpu';
import {
  Fn,
  color,
  cos,
  dot,
  float,
  length,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  saturate,
  sin,
  uniform,
  vec3,
} from 'three/tsl';

export type UnderwaterMode = 'auto' | 'above' | 'underwater';

export type OceanEnvironmentParameters = {
  causticStrength: number;
  cloudStrength: number;
  horizonHaze: number;
  sunAzimuthDegrees: number;
  sunElevationDegrees: number;
  sunGlowStrength: number;
  sunIntensity: number;
  underwaterFogDensity: number;
  underwaterParticleStrength: number;
  waterlineBlendDistance: number;
  underwaterMode: UnderwaterMode;
  // Sky gradient colors (kept in sync with WaterMesh for consistent reflections)
  skyHorizonColor: number;
  skyLowColor: number;
  skyZenithColor: number;
  skyWarmHazeColor: number;
};

export const DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS: OceanEnvironmentParameters = {
  causticStrength: 0.32,
  cloudStrength: 0.68,
  horizonHaze: 0.72,
  sunAzimuthDegrees: 238,
  sunElevationDegrees: 22,
  sunGlowStrength: 0.82,
  sunIntensity: 3.35,
  underwaterFogDensity: 0.028,
  underwaterParticleStrength: 0.48,
  waterlineBlendDistance: 3.5,
  underwaterMode: 'auto',
  // Sky gradient (coordinated with WaterMesh — cooler & deeper for blue ocean)
  skyHorizonColor: 0x9ac4d4,
  skyLowColor: 0x66a4c4,
  skyZenithColor: 0x152d58,
  skyWarmHazeColor: 0xf2e0cc,
};

// Cooler, deeper blues for the new vibrant blue ocean palette
const ABOVE_WATER_BACKGROUND = new THREE.Color(0x7fb8d4);
const UNDERWATER_BACKGROUND = new THREE.Color(0x041f32);
const ABOVE_WATER_FOG_COLOR = new THREE.Color(0x9cc4d8);
const UNDERWATER_FOG_COLOR = new THREE.Color(0x082a3e);
const ACTIVE_FOG = new THREE.FogExp2(ABOVE_WATER_FOG_COLOR, 0.001);
const SUN_DISK_RADIUS = 52;
const SUN_DISTANCE = 620;

/**
 * Visual-only environment layer for Milestone 7.
 *
 * The seafloor caustics and underwater particles read camera/time state, while
 * the actual wave shape still comes exclusively from the spectral simulation.
 */
export class OceanEnvironment {
  readonly group = new THREE.Group();
  readonly seaFloor: THREE.Mesh;
  readonly particles: THREE.Points;
  readonly skyDome: THREE.Mesh;
  readonly sunDisk: THREE.Mesh;
  readonly horizonGroup = new THREE.Group();

  private readonly timeUniform = uniform(0);
  private readonly causticStrengthUniform = uniform(
    DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS.causticStrength,
  );
  private readonly horizonHazeUniform = uniform(DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS.horizonHaze);
  private readonly cloudStrengthUniform = uniform(DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS.cloudStrength);
  private readonly sunGlowStrengthUniform = uniform(
    DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS.sunGlowStrength,
  );
  private readonly sunDirectionUniform = uniform(new THREE.Vector3());

  // Sky gradient uniforms (drive the sky dome and should stay in sync with water)
  private readonly skyHorizonColorUniform = uniform(
    new THREE.Color(DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS.skyHorizonColor),
  );
  private readonly skyLowColorUniform = uniform(
    new THREE.Color(DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS.skyLowColor),
  );
  private readonly skyZenithColorUniform = uniform(
    new THREE.Color(DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS.skyZenithColor),
  );
  private readonly skyWarmHazeColorUniform = uniform(
    new THREE.Color(DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS.skyWarmHazeColor),
  );
  private readonly particleMaterial: THREE.PointsMaterial;
  private readonly parameters = { ...DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS };
  private readonly sunDirection = new THREE.Vector3();
  private readonly sunLight?: THREE.DirectionalLight;
  private readonly hemiLight?: THREE.HemisphereLight;
  private underwaterBlend = 0;

  constructor(
    private readonly scene: THREE.Scene,
    lights: {
      sun?: THREE.DirectionalLight;
      hemisphere?: THREE.HemisphereLight;
    } = {},
  ) {
    this.sunLight = lights.sun;
    this.hemiLight = lights.hemisphere;
    this.group.name = 'Milestone 12 Ocean Environment';

    this.skyDome = this.createSkyDome();
    this.sunDisk = this.createSunDisk();
    this.createHorizonSilhouettes();
    this.group.add(this.skyDome, this.sunDisk, this.horizonGroup);

    const floorGeometry = new THREE.PlaneGeometry(1200, 1200, 1, 1);
    const floorMaterial = new THREE.MeshStandardNodeMaterial({
      roughness: 0.88,
      metalness: 0,
    });
    floorMaterial.colorNode = Fn(() => {
      const sand = color(0x8f8a72);
      const tealShadow = color(0x153a48);  // cooler shadow to match new blue water palette
      const waveA = sin(positionWorld.x.mul(0.78).add(this.timeUniform.mul(0.72)));
      const waveB = sin(positionWorld.z.mul(0.68).sub(this.timeUniform.mul(0.56)));
      const waveC = cos(
        positionWorld.x.mul(0.52).add(positionWorld.z.mul(0.61)).add(this.timeUniform.mul(0.93)),
      );
      const waveD = sin(
        positionWorld.x.mul(-0.58).add(positionWorld.z.mul(0.47)).sub(this.timeUniform.mul(0.68)),
      );
      const causticLines = pow(
        saturate(waveA.add(waveB).add(waveC).add(waveD).mul(0.17).add(0.52)),
        float(15),
      );
      const caustics = causticLines.mul(this.causticStrengthUniform);

      return mix(tealShadow, sand, float(0.55)).add(color(0xcdf7df).mul(caustics));
    })();
    floorMaterial.emissiveNode = Fn(() => {
      const pulse = pow(
        saturate(
          sin(positionWorld.x.mul(0.42).add(this.timeUniform.mul(1.1)))
            .mul(cos(positionWorld.z.mul(0.38).sub(this.timeUniform.mul(0.76))))
            .mul(0.5)
            .add(0.5),
        ),
        float(12),
      );
      return color(0x9ff3d4).mul(pulse).mul(this.causticStrengthUniform).mul(0.18);
    })();

    this.seaFloor = new THREE.Mesh(floorGeometry, floorMaterial);
    this.seaFloor.name = 'Caustic Seafloor';
    this.seaFloor.rotation.x = -Math.PI / 2;
    this.seaFloor.position.y = -24;
    this.group.add(this.seaFloor);

    const particleGeometry = new THREE.BufferGeometry();
    const particleCount = 420;
    const positions = new Float32Array(particleCount * 3);
    const random = mulberry32(0x5ea);

    for (let i = 0; i < particleCount; i += 1) {
      const index = i * 3;
      positions[index] = (random() - 0.5) * 260;
      positions[index + 1] = -2 - random() * 32;
      positions[index + 2] = (random() - 0.5) * 260;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particleMaterial = new THREE.PointsMaterial({
      color: 0xbdeef0,
      size: 0.08,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.particles = new THREE.Points(particleGeometry, this.particleMaterial);
    this.particles.name = 'Underwater Suspended Particles';
    this.particles.visible = false;
    this.group.add(this.particles);

    scene.add(this.group);
    this.updateSunDirection();
    this.scene.fog = ACTIVE_FOG;
    this.applyAtmosphere(0);
  }

  update(camera: THREE.Camera, elapsedSeconds: number): void {
    this.timeUniform.value = elapsedSeconds;
    this.skyDome.position.set(camera.position.x, 0, camera.position.z);
    this.sunDisk.position.copy(this.sunDirection).multiplyScalar(SUN_DISTANCE).add(this.skyDome.position);
    this.sunDisk.lookAt(camera.position);

    const targetBlend = this.computeUnderwaterBlend(camera.position.y);
    if (Math.abs(targetBlend - this.underwaterBlend) > 0.001) {
      this.applyAtmosphere(targetBlend);
    }

    this.particles.position.x = camera.position.x;
    this.particles.position.z = camera.position.z;
    this.particles.rotation.y = elapsedSeconds * 0.012;
  }

  getSunDirection(): THREE.Vector3 {
    return this.sunDirection;
  }

  setParameters(next: Partial<OceanEnvironmentParameters>): void {
    Object.assign(this.parameters, next);

    if (next.causticStrength !== undefined) {
      this.causticStrengthUniform.value = next.causticStrength;
    }

    if (next.horizonHaze !== undefined) {
      this.horizonHazeUniform.value = next.horizonHaze;
      this.updateAboveWaterFog();
    }

    if (next.cloudStrength !== undefined) {
      this.cloudStrengthUniform.value = next.cloudStrength;
    }

    if (next.sunGlowStrength !== undefined) {
      this.sunGlowStrengthUniform.value = next.sunGlowStrength;
    }

    if (
      next.sunAzimuthDegrees !== undefined ||
      next.sunElevationDegrees !== undefined ||
      next.sunIntensity !== undefined
    ) {
      this.updateSunDirection();
    }

    if (
      next.underwaterParticleStrength !== undefined ||
      next.underwaterFogDensity !== undefined ||
      next.waterlineBlendDistance !== undefined
    ) {
      this.applyAtmosphere(this.underwaterBlend);
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
    this.scene.remove(this.group);
    this.skyDome.geometry.dispose();
    (this.skyDome.material as THREE.Material).dispose();
    this.sunDisk.geometry.dispose();
    (this.sunDisk.material as THREE.Material).dispose();
    this.horizonGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.seaFloor.geometry.dispose();
    (this.seaFloor.material as THREE.Material).dispose();
    this.particles.geometry.dispose();
    this.particleMaterial.dispose();
  }

  private applyAtmosphere(underwaterBlend: number): void {
    this.underwaterBlend = underwaterBlend;
    this.seaFloor.visible = underwaterBlend > 0.04;
    this.particles.visible = underwaterBlend > 0.04;
    this.skyDome.visible = underwaterBlend < 0.65;
    this.sunDisk.visible = underwaterBlend < 0.65;
    this.horizonGroup.visible = underwaterBlend < 0.65;
    this.particleMaterial.opacity = this.parameters.underwaterParticleStrength * underwaterBlend;

    const background = ABOVE_WATER_BACKGROUND.clone().lerp(UNDERWATER_BACKGROUND, underwaterBlend);
    const fogColor = ABOVE_WATER_FOG_COLOR.clone().lerp(UNDERWATER_FOG_COLOR, underwaterBlend);
    const aboveDensity = 0.001 + this.parameters.horizonHaze * 0.00085;

    ACTIVE_FOG.color.copy(fogColor);
    ACTIVE_FOG.density = THREE.MathUtils.lerp(
      aboveDensity,
      this.parameters.underwaterFogDensity,
      underwaterBlend,
    );
    this.scene.background = background;
    this.updateAboveWaterFog();
    this.scene.fog = ACTIVE_FOG;
  }

  private createSkyDome(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(900, 48, 24);
    const material = new THREE.MeshBasicNodeMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    material.colorNode = Fn(() => {
      const localDirection = normalize(positionLocal);
      const height = saturate(localDirection.y.mul(0.58).add(0.42));
      // Sky gradient driven by uniforms (synced with water material for consistent reflections)
      const horizon = this.skyHorizonColorUniform;
      const lowSky = this.skyLowColorUniform;
      const zenith = this.skyZenithColorUniform;
      const warmHaze = this.skyWarmHazeColorUniform;
      const sky = mix(mix(horizon, lowSky, height), zenith, pow(height, float(1.72)));

      const sunDirection = normalize(vec3(this.sunDirectionUniform));
      const sunAlignment = pow(saturate(dot(localDirection, sunDirection)), float(42));
      const haze = pow(saturate(float(1).sub(height)), float(2.15)).mul(this.horizonHazeUniform);
      const atmosphericSky = mix(sky, warmHaze, saturate(haze.add(sunAlignment.mul(0.62))));

      // Wispy horizontal cloud bands drift slowly across the mid/upper sky.
      const cloudWaveA = sin(
        localDirection.x.mul(9.5).add(localDirection.z.mul(6.2)).add(this.timeUniform.mul(0.035)),
      );
      const cloudWaveB = sin(
        localDirection.x.mul(14.8).sub(localDirection.z.mul(8.4)).add(this.timeUniform.mul(0.028)),
      );
      const cloudWaveC = cos(
        localDirection.x.mul(5.6).add(localDirection.z.mul(11.2)).sub(this.timeUniform.mul(0.018)),
      );
      const cloudNoise = pow(
        saturate(cloudWaveA.mul(0.42).add(cloudWaveB.mul(0.34)).add(cloudWaveC.mul(0.24)).add(0.48)),
        float(2.35),
      );
      const cloudHeightMask = pow(saturate(height.mul(0.95).add(0.08)), float(0.85)).mul(
        saturate(float(1).sub(height.mul(0.35))),
      );
      const cloudMask = cloudNoise.mul(cloudHeightMask).mul(this.cloudStrengthUniform);
      const cloudColor = mix(color(0xf8f4ee), color(0xe8edf5), saturate(height.mul(0.6)));

      return mix(atmosphericSky, cloudColor, cloudMask.mul(0.58));
    })();

    const sky = new THREE.Mesh(geometry, material);
    sky.name = 'Benchmark Sky Dome';
    sky.renderOrder = -1000;

    return sky;
  }

  private createSunDisk(): THREE.Mesh {
    const geometry = new THREE.CircleGeometry(SUN_DISK_RADIUS, 48);
    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });

    material.colorNode = Fn(() => {
      const radial = length(positionLocal.xy).div(float(SUN_DISK_RADIUS));
      const core = pow(saturate(float(1).sub(radial.mul(1.75))), float(7));
      const halo = pow(saturate(float(1).sub(radial)), float(1.65)).mul(this.sunGlowStrengthUniform);
      const coreColor = color(0xfff8e8);
      const haloColor = color(0xffe4b0);
      return mix(haloColor, coreColor, saturate(core.mul(2.8).add(halo.mul(0.25))));
    })();

    material.opacityNode = Fn(() => {
      const radial = length(positionLocal.xy).div(float(SUN_DISK_RADIUS));
      const falloff = pow(saturate(float(1).sub(radial)), float(1.2));
      return falloff.mul(mix(float(0.32), float(0.98), this.sunGlowStrengthUniform));
    })();

    const disk = new THREE.Mesh(geometry, material);
    disk.name = 'Benchmark Sun Disk';
    disk.renderOrder = -900;

    return disk;
  }

  private createHorizonSilhouettes(): void {
    this.horizonGroup.name = 'Benchmark Horizon Silhouettes';

    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x49372f,
      roughness: 0.92,
      metalness: 0,
      fog: true,
    });
    const hazeRockMaterial = new THREE.MeshStandardMaterial({
      color: 0x667380,
      roughness: 0.96,
      metalness: 0,
      fog: true,
    });

    this.addIsland(-205, -292, {
      rockMaterial: hazeRockMaterial,
      baseRadius: 58,
      baseHeight: 98,
      palmCount: 3,
      rotation: 0.15,
    });
    this.addIsland(-118, -318, {
      rockMaterial: hazeRockMaterial,
      baseRadius: 38,
      baseHeight: 72,
      palmCount: 2,
      rotation: -0.35,
    });
    this.addIsland(168, -278, {
      rockMaterial: rockMaterial,
      baseRadius: 68,
      baseHeight: 118,
      palmCount: 4,
      rotation: 0.08,
    });
    this.addIsland(252, -308, {
      rockMaterial: rockMaterial,
      baseRadius: 44,
      baseHeight: 84,
      palmCount: 2,
      rotation: -0.22,
    });
    this.addDistantRock(330, -342, 88, 156, hazeRockMaterial, 0.38);
  }

  private addDistantRock(
    x: number,
    z: number,
    radius: number,
    height: number,
    material: THREE.Material,
    rotation: number,
  ): void {
    const rock = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 8), material);
    rock.name = 'Distant Horizon Rock';
    rock.position.set(x, -10 + height * 0.38, z);
    rock.rotation.set(0.04, rotation, 0.12);
    rock.scale.set(1, 1, 0.62);
    this.horizonGroup.add(rock);
  }

  private addIsland(
    x: number,
    z: number,
    options: {
      rockMaterial: THREE.Material;
      baseRadius: number;
      baseHeight: number;
      palmCount: number;
      rotation: number;
    },
  ): void {
    const island = new THREE.Group();
    island.name = 'Benchmark Island';
    island.position.set(x, 0, z);
    island.rotation.y = options.rotation;

    const mainRock = new THREE.Mesh(
      new THREE.ConeGeometry(options.baseRadius, options.baseHeight, 8),
      options.rockMaterial,
    );
    mainRock.position.set(0, -10 + options.baseHeight * 0.36, 0);
    mainRock.scale.set(1.08, 1, 0.78);
    island.add(mainRock);

    const shoulder = new THREE.Mesh(
      new THREE.ConeGeometry(options.baseRadius * 0.62, options.baseHeight * 0.58, 7),
      options.rockMaterial,
    );
    shoulder.position.set(options.baseRadius * 0.34, -10 + options.baseHeight * 0.22, -18);
    shoulder.rotation.z = 0.18;
    island.add(shoulder);

    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(options.baseRadius * 1.15, options.baseHeight * 0.12, options.baseRadius * 0.55),
      options.rockMaterial,
    );
    shelf.position.set(0, -10 + options.baseHeight * 0.12, 0);
    island.add(shelf);

    for (let i = 0; i < options.palmCount; i += 1) {
      const angle = (i / options.palmCount) * Math.PI * 2 + options.rotation;
      const palmX = Math.cos(angle) * options.baseRadius * 0.22;
      const palmZ = Math.sin(angle) * options.baseRadius * 0.16;
      this.addPalm(island, palmX, palmZ, 16 + i * 2.4);
    }

    this.horizonGroup.add(island);
  }

  private addPalm(parent: THREE.Group, x: number, z: number, height: number): void {
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a3f2c,
      roughness: 0.88,
      metalness: 0,
      fog: true,
    });
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: 0x3f6b3a,
      roughness: 0.82,
      metalness: 0,
      fog: true,
    });

    const palm = new THREE.Group();
    palm.name = 'Palm Tree';
    palm.position.set(x, -10 + height * 0.12, z);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, height, 6), trunkMaterial);
    trunk.position.y = height * 0.5;
    palm.add(trunk);

    for (let i = 0; i < 5; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5.8, 4), leafMaterial);
      leaf.rotation.z = Math.PI * 0.52;
      leaf.rotation.y = (i / 5) * Math.PI * 2;
      leaf.position.y = height + 1.2;
      palm.add(leaf);
    }

    parent.add(palm);
  }

  private updateSunDirection(): void {
    const azimuth = THREE.MathUtils.degToRad(this.parameters.sunAzimuthDegrees);
    const elevation = THREE.MathUtils.degToRad(this.parameters.sunElevationDegrees);
    const cosElevation = Math.cos(elevation);

    this.sunDirection
      .set(Math.sin(azimuth) * cosElevation, Math.sin(elevation), Math.cos(azimuth) * cosElevation)
      .normalize();
    this.sunDirectionUniform.value.copy(this.sunDirection);

    if (this.sunLight) {
      this.sunLight.position.copy(this.sunDirection).multiplyScalar(160);
      this.sunLight.color.set(0xfff4dc);
      this.sunLight.intensity = this.parameters.sunIntensity;
    }

    if (this.hemiLight) {
      this.hemiLight.color.set(0x93c4ef);
      this.hemiLight.groundColor.set(0x18343b);
      this.hemiLight.intensity = 0.72;
    }
  }

  private updateAboveWaterFog(): void {
    const haze = this.parameters.horizonHaze;
    ABOVE_WATER_FOG_COLOR.set(0xa8bcc8).lerp(new THREE.Color(0xd4c4b0), haze * 0.52);
    ABOVE_WATER_BACKGROUND.set(0x88b8d4).lerp(new THREE.Color(0xc8d0d8), haze * 0.28);
    if (this.underwaterBlend <= 0.001) {
      ACTIVE_FOG.color.copy(ABOVE_WATER_FOG_COLOR);
      ACTIVE_FOG.density = 0.001 + haze * 0.00085;
      this.scene.background = ABOVE_WATER_BACKGROUND.clone();
    }
  }

  private computeUnderwaterBlend(cameraY: number): number {
    if (this.parameters.underwaterMode === 'underwater') {
      return 1;
    }

    if (this.parameters.underwaterMode === 'above') {
      return 0;
    }

    const blendDistance = Math.max(0.01, this.parameters.waterlineBlendDistance);
    return THREE.MathUtils.smoothstep(-cameraY, -blendDistance, blendDistance);
  }
}

function mulberry32(seed: number): () => number {
  let state = seed;

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
