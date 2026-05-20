import GUI from 'lil-gui';
import type { FloatingBoat } from '../buoyancy/FloatingBoat';
import type { FloatingSphere } from '../buoyancy/FloatingSphere';
import { DEFAULT_BUOYANCY_PARAMETERS, type BuoyancyParameters } from '../buoyancy/types';
import { OCEAN_PRESETS, OCEAN_PRESET_IDS } from '../spectrum/presets';
import type { OceanPreset, OceanPresetId } from '../spectrum/types';
import {
  CASCADE_IDS,
  cascadeAmplitudesFromPreset,
  type CascadeId,
  type OceanCascadeSystemParameters,
} from '../simulation/cascadeConfig';
import type { OceanCascadeSystem } from '../simulation/OceanCascadeSystem';
import type { WaterMesh } from '../rendering/WaterMesh';
import { DEFAULT_FOAM_PARAMETERS, type FoamParameters } from '../foam/types';
import type { DebugCascadeTarget, DebugTextureMode, DebugTextureView } from './DebugTextureView';

type DebugGuiState = OceanCascadeSystemParameters & {
  windDirectionDegrees: number;
  preset: OceanPresetId;
  debugView: DebugTextureMode;
  debugCascade: DebugCascadeTarget;
  foam: FoamParameters & { renderStrength: number };
  buoyancy: BuoyancyParameters & {
    sphereEnabled: boolean;
    boatEnabled: boolean;
  };
};

export type BuoyancyDebugTargets = {
  sphere: FloatingSphere;
  boat: FloatingBoat;
};

function refreshGuiDisplays(gui: GUI): void {
  gui.controllers.forEach((controller) => controller.updateDisplay());
  gui.folders.forEach((folder) => refreshGuiDisplays(folder));
}

export class DebugControls {
  readonly gui: GUI;
  private readonly state: DebugGuiState;
  private readonly applyPreset: (preset: OceanPreset) => void;

  constructor(
    parameters: OceanCascadeSystemParameters,
    cascadeSystem: OceanCascadeSystem,
    water: WaterMesh,
    debugView: DebugTextureView,
    buoyancyTargets?: BuoyancyDebugTargets,
  ) {
    this.gui = new GUI({ title: 'Spectral Ocean' });
    this.state = {
      ...parameters,
      cascades: {
        swell: { ...parameters.cascades.swell },
        mid: { ...parameters.cascades.mid },
        detail: { ...parameters.cascades.detail },
      },
      windDirectionDegrees: (parameters.windDirection * 180) / Math.PI,
      preset: 'windySea',
      debugView: 'off',
      debugCascade: 'combined',
      foam: { ...DEFAULT_FOAM_PARAMETERS, renderStrength: 1.35 },
      buoyancy: {
        ...DEFAULT_BUOYANCY_PARAMETERS,
        sphereEnabled: true,
        boatEnabled: true,
      },
    };

    const syncGlobalSpectrum = () => {
      cascadeSystem.setParameters({
        windSpeed: this.state.windSpeed,
        windDirection: (this.state.windDirectionDegrees * Math.PI) / 180,
        spectrumModel: this.state.spectrumModel,
        fetch: this.state.fetch,
        peakEnhancement: this.state.peakEnhancement,
        directionalSpread: this.state.directionalSpread,
        seed: Date.now(),
      });
    };

    this.applyPreset = (preset: OceanPreset) => {
      this.state.spectrumModel = preset.spectrumModel;
      this.state.windSpeed = preset.windSpeed;
      this.state.windDirectionDegrees = preset.windDirection;
      this.state.fetch = preset.fetch;
      this.state.peakEnhancement = preset.peakEnhancement;
      this.state.directionalSpread = preset.directionalSpread;
      this.state.timeScale = preset.timeScale;
      const amplitudes = cascadeAmplitudesFromPreset(preset.amplitude, {
        swellScale: preset.swellAmplitudeScale,
        detailScale: preset.detailAmplitudeScale,
      });
      this.state.cascades.swell.enabled = preset.enableSwell ?? false;
      this.state.cascades.swell.amplitude = amplitudes.swell;
      this.state.cascades.swell.choppiness = preset.choppiness * 0.6;
      this.state.cascades.swell.heightScale = preset.heightScale;
      this.state.cascades.swell.smallWaveDamping = preset.smallWaveDamping * 1.2;
      this.state.cascades.mid.amplitude = amplitudes.mid;
      this.state.cascades.mid.choppiness = preset.choppiness;
      this.state.cascades.mid.heightScale = preset.heightScale;
      this.state.cascades.mid.smallWaveDamping = preset.smallWaveDamping;
      this.state.cascades.detail.enabled = preset.enableDetail ?? false;
      this.state.cascades.detail.amplitude = amplitudes.detail;
      this.state.cascades.detail.choppiness = Math.min(1, preset.choppiness * 0.9);
      this.state.cascades.detail.heightScale = preset.heightScale;
      this.state.cascades.detail.smallWaveDamping = preset.smallWaveDamping * 1.5;
      refreshGuiDisplays(this.gui);
      water.setHeightScale(preset.heightScale);
      cascadeSystem.clearFoam();
      cascadeSystem.applyPreset(preset, (preset.windDirection * Math.PI) / 180);
    };

    const presetFolder = this.gui.addFolder('Presets');
    const presetOptions = Object.fromEntries(
      OCEAN_PRESET_IDS.map((id) => [OCEAN_PRESETS[id].label, id]),
    );
    presetFolder
      .add(this.state, 'preset', presetOptions)
      .name('Sea state')
      .onChange((presetId: OceanPresetId) => {
        this.applyPreset(OCEAN_PRESETS[presetId]);
      });

    const spectrumFolder = this.gui.addFolder('Global spectrum');
    spectrumFolder
      .add(this.state, 'spectrumModel', { Phillips: 'phillips', JONSWAP: 'jonswap' })
      .name('Model')
      .onFinishChange(syncGlobalSpectrum);
    spectrumFolder
      .add(this.state, 'windSpeed', 1, 40, 0.1)
      .name('Wind speed')
      .decimals(1)
      .onFinishChange(syncGlobalSpectrum);
    spectrumFolder
      .add(this.state, 'windDirectionDegrees', 0, 360, 1)
      .name('Wind direction')
      .decimals(0)
      .onFinishChange(syncGlobalSpectrum);
    spectrumFolder
      .add(this.state, 'fetch', 10_000, 1_000_000, 1000)
      .name('Fetch (m)')
      .decimals(0)
      .onFinishChange(syncGlobalSpectrum);
    spectrumFolder
      .add(this.state, 'peakEnhancement', 1, 6, 0.1)
      .name('Peak γ')
      .decimals(1)
      .onFinishChange(syncGlobalSpectrum);
    spectrumFolder
      .add(this.state, 'directionalSpread', 0.5, 8, 0.25)
      .name('Directionality')
      .decimals(2)
      .onFinishChange(syncGlobalSpectrum);

    this.gui
      .add(this.state, 'timeScale', 0, 4, 0.01)
      .name('Time scale')
      .decimals(2)
      .onChange((value: number) => {
        cascadeSystem.setParameters({ timeScale: value });
      });

    const addCascadeFolder = (id: CascadeId) => {
      const cascade = this.state.cascades[id];
      const folder = this.gui.addFolder(cascade.label);

      folder.add(cascade, 'enabled').name('Enabled').onChange(() => {
        cascadeSystem.setCascadeParameters(id, { enabled: cascade.enabled });
      });
      folder
        .add(cascade, 'patchSize', 16, 1200, 1)
        .name('Length scale (m)')
        .decimals(0)
        .onFinishChange(() => {
          cascadeSystem.setCascadeParameters(id, { patchSize: cascade.patchSize });
        });
      folder
        .add(cascade, 'amplitude', 0.00005, 0.005, 0.00005)
        .name('Amplitude')
        .decimals(5)
        .onFinishChange(() => {
          cascadeSystem.setCascadeParameters(id, { amplitude: cascade.amplitude });
        });
      folder
        .add(cascade, 'windInfluence', 0, 2, 0.05)
        .name('Wind influence')
        .decimals(2)
        .onFinishChange(() => {
          cascadeSystem.setCascadeParameters(id, { windInfluence: cascade.windInfluence });
        });
      folder
        .add(cascade, 'choppiness', 0, 1.5, 0.01)
        .name('Choppiness')
        .decimals(2)
        .onChange(() => {
          cascadeSystem.setCascadeParameters(id, { choppiness: cascade.choppiness });
        });
      folder
        .add(cascade, 'heightScale', 0.25, 2.5, 0.05)
        .name('Height scale')
        .decimals(2)
        .onChange((value: number) => {
          cascadeSystem.setCascadeParameters(id, { heightScale: value });
          if (id === 'mid') {
            water.setHeightScale(value);
          }
        });
      folder
        .add(cascade, 'smallWaveDamping', 0.001, 0.12, 0.001)
        .name('Tiny-wave damping')
        .decimals(3)
        .onFinishChange(() => {
          cascadeSystem.setCascadeParameters(id, { smallWaveDamping: cascade.smallWaveDamping });
        });
    };

    for (const id of CASCADE_IDS) {
      addCascadeFolder(id);
    }

    const foamFolder = this.gui.addFolder('Foam');
    const syncFoam = () => {
      const { renderStrength: _renderStrength, ...foamParams } = this.state.foam;
      cascadeSystem.setFoamParameters(foamParams);
      water.setFoamStrength(this.state.foam.renderStrength);
    };

    foamFolder.add(this.state.foam, 'enabled').name('Enabled').onChange(syncFoam);
    foamFolder
      .add(this.state.foam, 'threshold', 0, 0.5, 0.01)
      .name('Threshold')
      .decimals(2)
      .onChange(syncFoam);
    foamFolder
      .add(this.state.foam, 'accumulationRate', 0, 6, 0.05)
      .name('Accumulation')
      .decimals(2)
      .onChange(syncFoam);
    foamFolder
      .add(this.state.foam, 'decayRate', 0.05, 3, 0.01)
      .name('Decay')
      .decimals(2)
      .onChange(syncFoam);
    foamFolder
      .add(this.state.foam, 'coverage', 0.25, 3, 0.05)
      .name('Coverage')
      .decimals(2)
      .onChange(syncFoam);
    foamFolder
      .add(this.state.foam, 'renderStrength', 0, 1.5, 0.01)
      .name('Render strength')
      .decimals(2)
      .onChange(syncFoam);
    foamFolder.add({ clear: () => cascadeSystem.clearFoam() }, 'clear').name('Clear foam');

    if (buoyancyTargets) {
      const { sphere, boat } = buoyancyTargets;
      const syncBuoyancy = () => {
        const { sphereEnabled, boatEnabled, ...params } = this.state.buoyancy;
        Object.assign(sphere.buoyancy, params);
        Object.assign(boat.buoyancy, params);
        sphere.enabled = sphereEnabled;
        boat.enabled = boatEnabled;
      };

      const buoyancyFolder = this.gui.addFolder('Buoyancy');
      buoyancyFolder
        .add(this.state.buoyancy, 'sphereEnabled')
        .name('Sphere')
        .onChange(syncBuoyancy);
      buoyancyFolder.add(this.state.buoyancy, 'boatEnabled').name('Boat').onChange(syncBuoyancy);
      buoyancyFolder
        .add(this.state.buoyancy, 'verticalStiffness', 8, 120, 1)
        .name('Vertical stiffness')
        .onChange(syncBuoyancy);
      buoyancyFolder
        .add(this.state.buoyancy, 'dampingRatio', 0.5, 2, 0.05)
        .name('Damping ratio')
        .decimals(2)
        .onChange(syncBuoyancy);
      buoyancyFolder
        .add(this.state.buoyancy, 'heightFollowRate', 1, 16, 0.5)
        .name('Height follow')
        .decimals(1)
        .onChange(syncBuoyancy);
      buoyancyFolder
        .add(this.state.buoyancy, 'linearDrag', 0, 4, 0.1)
        .name('Linear drag')
        .onChange(syncBuoyancy);
      buoyancyFolder
        .add(this.state.buoyancy, 'orientationBlend', 0.5, 12, 0.1)
        .name('Orientation blend')
        .onChange(syncBuoyancy);
      buoyancyFolder
        .add(
          {
            resetSphere: () => sphere.reset(),
            resetBoat: () => boat.reset(),
          },
          'resetSphere',
        )
        .name('Reset sphere');
      buoyancyFolder.add({ resetBoat: () => boat.reset() }, 'resetBoat').name('Reset boat');
      syncBuoyancy();
    }

    const debugFolder = this.gui.addFolder('Debug views');
    debugFolder
      .add(this.state, 'debugCascade', {
        Combined: 'combined',
        Swell: 'swell',
        'Mid waves': 'mid',
        Ripples: 'detail',
      })
      .name('Cascade')
      .onChange((target: DebugCascadeTarget) => {
        debugView.setCascadeTarget(target);
      });
    debugFolder
      .add(this.state, 'debugView', {
        Off: 'off',
        Height: 'height',
        Displacement: 'displacement',
        Normal: 'normal',
        Jacobian: 'jacobian',
        Foam: 'foam',
      })
      .name('Texture')
      .onChange((mode: DebugTextureMode) => {
        debugView.setMode(mode);
      });

    debugView.setMode(this.state.debugView);
    debugView.setCascadeTarget(this.state.debugCascade);

    syncFoam();
    water.setPatchSize(parameters.worldPatchSize);
    this.applyPreset(OCEAN_PRESETS[this.state.preset]);
  }

  dispose(): void {
    this.gui.destroy();
  }
}
