import * as THREE from 'three/webgpu';
import { Fn, color, float, max, mix, saturate, texture, uniform, uv, vec3 } from 'three/tsl';
import type { OceanSimulation } from '../simulation/OceanSimulation';

export type DebugTextureMode = 'off' | 'height' | 'displacement' | 'normal' | 'jacobian';

export class DebugTextureView {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicNodeMaterial;
  private readonly modeUniform = uniform(0);
  private mode: DebugTextureMode = 'off';

  constructor(simulation: OceanSimulation) {
    const geometry = new THREE.PlaneGeometry(2, 2);
    const modeUniform = this.modeUniform;

    this.material = new THREE.MeshBasicNodeMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
    });

    this.material.colorNode = Fn(() => {
      const sampleUv = uv();
      const heightSample = texture(simulation.heightDataTexture, sampleUv).x;
      const displacementSample = texture(simulation.displacementDataTexture, sampleUv);
      const normalSample = texture(simulation.normalDataTexture, sampleUv).xyz.mul(2).sub(1);
      const jacobianSample = texture(simulation.jacobianDataTexture, sampleUv);

      const heightView = vec3(saturate(heightSample.mul(0.002).add(0.5)));
      const displacementView = displacementSample.xyz.mul(0.35).add(0.5);
      const normalView = normalSample.mul(0.5).add(0.5);
      const compression = float(1).sub(jacobianSample.x);
      const jacobianView = mix(
        color(0x0a2a3d),
        color(0xf2f6fa),
        max(compression, float(0)),
      );

      const mode = modeUniform;
      return mode
        .equal(4)
        .select(
          jacobianView,
          mode.equal(3).select(normalView, mode.equal(2).select(displacementView, heightView)),
        );
    })();

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'Debug Texture View';
    this.mesh.renderOrder = 10_000;
    this.mesh.visible = false;
  }

  setMode(mode: DebugTextureMode): void {
    this.mode = mode;
    this.mesh.visible = mode !== 'off';
    this.modeUniform.value =
      mode === 'height'
        ? 1
        : mode === 'displacement'
          ? 2
          : mode === 'normal'
            ? 3
            : mode === 'jacobian'
              ? 4
              : 0;
  }

  getMode(): DebugTextureMode {
    return this.mode;
  }

  updateLayout(camera: THREE.Camera, width: number, height: number): void {
    if (!this.mesh.visible) {
      return;
    }

    const distance = 1;
    const viewDirection = new THREE.Vector3();
    camera.getWorldDirection(viewDirection);

    this.mesh.position.copy(camera.position).addScaledVector(viewDirection, distance);
    this.mesh.quaternion.copy(camera.quaternion);

    const aspect = width / Math.max(height, 1);
    const panelHeight = 0.55;
    const panelWidth = panelHeight * aspect;
    this.mesh.scale.set(panelWidth, panelHeight, 1);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
