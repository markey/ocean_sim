import * as THREE from 'three/webgpu';
import {
  Fn,
  color,
  cos,
  dot,
  float,
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
  horizonHaze: number;
  sunAzimuthDegrees: number;
  sunElevationDegrees: number;
  sunIntensity: number;
  underwaterFogDensity: number;
  underwaterParticleStrength: number;
  waterlineBlendDistance: number;
  underwaterMode: UnderwaterMode;
};

export const DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS: OceanEnvironmentParameters = {
  causticStrength: 0.32,
  horizonHaze: 0.58,
  sunAzimuthDegrees: 238,
  sunElevationDegrees: 22,
  sunIntensity: 3.15,
  underwaterFogDensity: 0.028,
  underwaterParticleStrength: 0.48,
  waterlineBlendDistance: 3.5,
  underwaterMode: 'auto',
};

const ABOVE_WATER_BACKGROUND = new THREE.Color(0x79aeca);
const UNDERWATER_BACKGROUND = new THREE.Color(0x063142);
const ABOVE_WATER_FOG_COLOR = new THREE.Color(0x9db6c5);
const UNDERWATER_FOG_COLOR = new THREE.Color(0x0a3945);
const ACTIVE_FOG = new THREE.FogExp2(ABOVE_WATER_FOG_COLOR, 0.0009);
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
  private readonly sunDirectionUniform = uniform(new THREE.Vector3());
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
    this.group.name = 'Milestone 8 Ocean Environment';

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
      const sand = color(0x8c876d);
      const tealShadow = color(0x164a54);
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
    const aboveDensity = 0.0009 + this.parameters.horizonHaze * 0.00065;

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
      const horizon = color(0xb8c5c9);
      const lowSky = color(0x7fa4c9);
      const zenith = color(0x2e65ad);
      const warmHaze = color(0xf3d9b3);
      const sky = mix(mix(horizon, lowSky, height), zenith, pow(height, float(1.65)));
      const sunAlignment = pow(
        saturate(dot(localDirection, normalize(vec3(this.sunDirectionUniform)))),
        float(48),
      );
      const haze = pow(saturate(float(1).sub(height)), float(2.4)).mul(this.horizonHazeUniform);

      return mix(sky, warmHaze, saturate(haze.add(sunAlignment.mul(0.55))));
    })();

    const sky = new THREE.Mesh(geometry, material);
    sky.name = 'Benchmark Sky Dome';
    sky.renderOrder = -1000;

    return sky;
  }

  private createSunDisk(): THREE.Mesh {
    const geometry = new THREE.CircleGeometry(32, 48);
    const material = new THREE.MeshBasicMaterial({
      color: 0xfff4c7,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
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
    });
    const hazeRockMaterial = new THREE.MeshStandardMaterial({
      color: 0x5d6873,
      roughness: 0.96,
      metalness: 0,
    });

    const addRock = (
      x: number,
      z: number,
      radius: number,
      height: number,
      material: THREE.Material,
      rotation: number,
    ) => {
      const rock = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7), material);
      rock.name = 'Low-poly Horizon Rock';
      rock.position.set(x, -10 + height * 0.38, z);
      rock.rotation.set(0.04, rotation, 0.12);
      rock.scale.z = 0.62;
      this.horizonGroup.add(rock);
    };

    addRock(-210, -300, 56, 106, hazeRockMaterial, 0.2);
    addRock(-130, -324, 42, 78, hazeRockMaterial, -0.45);
    addRock(160, -286, 72, 128, rockMaterial, 0.1);
    addRock(245, -312, 48, 92, rockMaterial, -0.3);
    addRock(340, -350, 92, 168, hazeRockMaterial, 0.42);

    const buoyGroup = new THREE.Group();
    buoyGroup.name = 'Benchmark Buoy';
    buoyGroup.position.set(-88, 1, -110);

    const buoyMaterial = new THREE.MeshStandardMaterial({ color: 0xb34022, roughness: 0.55 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x231915, roughness: 0.7 });
    const buoyBase = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.7, 3.2, 12), buoyMaterial);
    const buoyTop = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.4, 12), buoyMaterial);
    const buoyMast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 8), darkMaterial);
    buoyBase.position.y = 0.9;
    buoyTop.position.y = 3.7;
    buoyMast.position.y = 5.5;
    buoyGroup.add(buoyBase, buoyTop, buoyMast);
    this.horizonGroup.add(buoyGroup);
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
      this.sunLight.color.set(0xfff0d0);
      this.sunLight.intensity = this.parameters.sunIntensity;
    }

    if (this.hemiLight) {
      this.hemiLight.color.set(0x8fb7e8);
      this.hemiLight.groundColor.set(0x18343b);
      this.hemiLight.intensity = 0.68;
    }
  }

  private updateAboveWaterFog(): void {
    const haze = this.parameters.horizonHaze;
    ABOVE_WATER_FOG_COLOR.set(0x9db6c5).lerp(new THREE.Color(0xc5b9aa), haze * 0.38);
    if (this.underwaterBlend <= 0.001) {
      ACTIVE_FOG.color.copy(ABOVE_WATER_FOG_COLOR);
      ACTIVE_FOG.density = 0.0009 + haze * 0.00065;
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
