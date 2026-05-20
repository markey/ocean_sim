import * as THREE from 'three/webgpu';
import { Fn, color, float, max, mix, saturate, texture, uniform, uv, vec3 } from 'three/tsl';
import type { CascadeId } from '../simulation/cascadeConfig';
import type { OceanCascadeSystem } from '../simulation/OceanCascadeSystem';
export type DebugTextureMode = 'off' | 'height' | 'displacement' | 'normal' | 'jacobian' | 'foam';
export type DebugCascadeTarget = 'combined' | CascadeId;

export class DebugTextureView {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicNodeMaterial;
  private readonly modeUniform = uniform(0);
  private readonly surfaceUniform = uniform(0);
  private mode: DebugTextureMode = 'off';
  private cascadeTarget: DebugCascadeTarget = 'combined';

  constructor(cascadeSystem: OceanCascadeSystem) {
    const geometry = new THREE.PlaneGeometry(2, 2);
    const modeUniform = this.modeUniform;
    const surfaceUniform = this.surfaceUniform;

    this.material = new THREE.MeshBasicNodeMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
    });

    this.material.colorNode = Fn(() => {
      const sampleUv = uv();
      const heightTex = texture(cascadeSystem.heightDataTexture, sampleUv);
      const displacementTex = texture(cascadeSystem.displacementDataTexture, sampleUv);
      const normalTex = texture(cascadeSystem.normalDataTexture, sampleUv);
      const jacobianTex = texture(cascadeSystem.jacobianDataTexture, sampleUv);
      const foamTex = texture(cascadeSystem.foamDataTexture, sampleUv);

      const swellHeight = texture(cascadeSystem.cascades.swell.heightDataTexture, sampleUv).x;
      const midHeight = texture(cascadeSystem.cascades.mid.heightDataTexture, sampleUv).x;
      const detailHeight = texture(cascadeSystem.cascades.detail.heightDataTexture, sampleUv).x;

      const swellDisplacement = texture(
        cascadeSystem.cascades.swell.displacementDataTexture,
        sampleUv,
      );
      const midDisplacement = texture(
        cascadeSystem.cascades.mid.displacementDataTexture,
        sampleUv,
      );
      const detailDisplacement = texture(
        cascadeSystem.cascades.detail.displacementDataTexture,
        sampleUv,
      );

      const swellNormal = texture(cascadeSystem.cascades.swell.normalDataTexture, sampleUv)
        .xyz.mul(2)
        .sub(1);
      const midNormal = texture(cascadeSystem.cascades.mid.normalDataTexture, sampleUv)
        .xyz.mul(2)
        .sub(1);
      const detailNormal = texture(cascadeSystem.cascades.detail.normalDataTexture, sampleUv)
        .xyz.mul(2)
        .sub(1);

      const swellJacobian = texture(cascadeSystem.cascades.swell.jacobianDataTexture, sampleUv);
      const midJacobian = texture(cascadeSystem.cascades.mid.jacobianDataTexture, sampleUv);
      const detailJacobian = texture(cascadeSystem.cascades.detail.jacobianDataTexture, sampleUv);

      const heightSample = surfaceUniform
        .equal(1)
        .select(swellHeight, surfaceUniform.equal(2).select(midHeight, surfaceUniform.equal(3).select(detailHeight, heightTex.x)));
      const displacementSample = surfaceUniform
        .equal(1)
        .select(
          swellDisplacement,
          surfaceUniform.equal(2).select(midDisplacement, surfaceUniform.equal(3).select(detailDisplacement, displacementTex)),
        );
      const normalSample = surfaceUniform
        .equal(1)
        .select(
          swellNormal,
          surfaceUniform.equal(2).select(midNormal, surfaceUniform.equal(3).select(detailNormal, normalTex.xyz.mul(2).sub(1))),
        );
      const jacobianSample = surfaceUniform
        .equal(1)
        .select(
          swellJacobian,
          surfaceUniform.equal(2).select(midJacobian, surfaceUniform.equal(3).select(detailJacobian, jacobianTex)),
        );

      const heightView = vec3(saturate(heightSample.mul(0.028).add(0.5)));
      const displacementView = displacementSample.xyz.mul(0.35).add(0.5);
      const normalView = normalSample.mul(0.5).add(0.5);
      const compression = float(1).sub(jacobianSample.x);
      const jacobianView = mix(
        color(0x0a2a3d),
        color(0xf2f6fa),
        max(compression, float(0)),
      );
      const foamView = mix(color(0x0a2a3d), color(0xffffff), saturate(foamTex.r));

      const mode = modeUniform;
      return mode
        .equal(5)
        .select(
          foamView,
          mode.equal(4).select(
            jacobianView,
            mode.equal(3).select(normalView, mode.equal(2).select(displacementView, heightView)),
          ),
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
              : mode === 'foam'
                ? 5
                : 0;
  }

  setCascadeTarget(target: DebugCascadeTarget): void {
    this.cascadeTarget = target;
    this.surfaceUniform.value =
      target === 'swell' ? 1 : target === 'mid' ? 2 : target === 'detail' ? 3 : 0;
  }

  getMode(): DebugTextureMode {
    return this.mode;
  }

  getCascadeTarget(): DebugCascadeTarget {
    return this.cascadeTarget;
  }

  updateLayout(camera: THREE.Camera, width: number, height: number): void {
    if (!this.mesh.visible) {
      return;
    }

    const distance = 1;
    const viewDirection = new THREE.Vector3();
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    camera.getWorldDirection(viewDirection);
    cameraRight.crossVectors(viewDirection, camera.up).normalize();
    cameraUp.crossVectors(cameraRight, viewDirection).normalize();

    // Small bottom-right PiP so debug textures do not cover the ocean view.
    const panelHeight = 0.22;
    const aspect = width / Math.max(height, 1);
    const panelWidth = panelHeight * aspect;
    const margin = 0.14;

    this.mesh.position
      .copy(camera.position)
      .addScaledVector(viewDirection, distance)
      .addScaledVector(cameraRight, panelWidth * 0.5 - margin)
      .addScaledVector(cameraUp, margin - panelHeight * 0.5);
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.scale.set(panelWidth, panelHeight, 1);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
