import * as THREE from 'three/webgpu';
import {
  Fn,
  color,
  cos,
  float,
  mix,
  positionWorld,
  pow,
  saturate,
  sin,
  uniform,
} from 'three/tsl';

export type UnderwaterMode = 'auto' | 'above' | 'underwater';

export type OceanEnvironmentParameters = {
  causticStrength: number;
  underwaterFogDensity: number;
  underwaterParticleStrength: number;
  underwaterMode: UnderwaterMode;
};

export const DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS: OceanEnvironmentParameters = {
  causticStrength: 0.32,
  underwaterFogDensity: 0.022,
  underwaterParticleStrength: 0.36,
  underwaterMode: 'auto',
};

const ABOVE_WATER_BACKGROUND = new THREE.Color(0x6fa7bb);
const UNDERWATER_BACKGROUND = new THREE.Color(0x063142);
const ABOVE_WATER_FOG = new THREE.Fog(0x6fa7bb, 180, 780);
const UNDERWATER_FOG = new THREE.FogExp2(0x0a3945, DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS.underwaterFogDensity);

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

  private readonly timeUniform = uniform(0);
  private readonly causticStrengthUniform = uniform(
    DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS.causticStrength,
  );
  private readonly particleMaterial: THREE.PointsMaterial;
  private readonly parameters = { ...DEFAULT_OCEAN_ENVIRONMENT_PARAMETERS };
  private readonly sunDirection = new THREE.Vector3(0.52, 0.78, 0.34).normalize();
  private underwater = false;

  constructor(private readonly scene: THREE.Scene) {
    this.group.name = 'Milestone 7 Ocean Environment';

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
    this.applyAtmosphere(false);
  }

  update(camera: THREE.Camera, elapsedSeconds: number): void {
    this.timeUniform.value = elapsedSeconds;

    const forced =
      this.parameters.underwaterMode === 'underwater' ||
      (this.parameters.underwaterMode === 'auto' && camera.position.y < 0);

    if (forced !== this.underwater) {
      this.applyAtmosphere(forced);
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

    if (next.underwaterParticleStrength !== undefined && this.underwater) {
      this.particleMaterial.opacity = next.underwaterParticleStrength;
    }

    if (next.underwaterFogDensity !== undefined && this.underwater) {
      UNDERWATER_FOG.density = next.underwaterFogDensity;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.seaFloor.geometry.dispose();
    (this.seaFloor.material as THREE.Material).dispose();
    this.particles.geometry.dispose();
    this.particleMaterial.dispose();
  }

  private applyAtmosphere(underwater: boolean): void {
    this.underwater = underwater;
    this.seaFloor.visible = underwater;
    this.particles.visible = underwater;
    this.particleMaterial.opacity = underwater ? this.parameters.underwaterParticleStrength : 0;

    if (underwater) {
      UNDERWATER_FOG.density = this.parameters.underwaterFogDensity;
      this.scene.background = UNDERWATER_BACKGROUND;
      this.scene.fog = UNDERWATER_FOG;
      return;
    }

    this.scene.background = ABOVE_WATER_BACKGROUND;
    this.scene.fog = ABOVE_WATER_FOG;
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
