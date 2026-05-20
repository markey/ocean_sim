import GUI from 'lil-gui';
import { OCEAN_PRESETS, OCEAN_PRESET_IDS } from '../spectrum/presets';
import type { OceanPresetId } from '../spectrum/types';
import type { OceanSimulation, OceanSimulationParameters } from '../simulation/OceanSimulation';
import type { WaterMesh } from '../rendering/WaterMesh';
import type { DebugTextureMode, DebugTextureView } from './DebugTextureView';

type DebugGuiState = OceanSimulationParameters & {
  windDirectionDegrees: number;
  preset: OceanPresetId;
  debugView: DebugTextureMode;
};

function refreshGuiDisplays(gui: GUI): void {
  gui.controllers.forEach((controller) => controller.updateDisplay());
  gui.folders.forEach((folder) => refreshGuiDisplays(folder));
}

export class DebugControls {
  readonly gui: GUI;
  private readonly state: DebugGuiState;

  constructor(
    parameters: OceanSimulationParameters,
    simulation: OceanSimulation,
    water: WaterMesh,
    debugView: DebugTextureView,
  ) {
    this.gui = new GUI({ title: 'Spectral Ocean' });
    this.state = {
      ...parameters,
      // Demo params store wind direction in degrees; simulation stores radians.
      windDirectionDegrees:
        parameters.windDirection <= Math.PI * 2
          ? (parameters.windDirection * 180) / Math.PI
          : parameters.windDirection,
      preset: 'windySea',
      debugView: 'off',
    };

    const syncSpectrum = () => {
      simulation.setParameters({
        amplitude: this.state.amplitude,
        windDirection: (this.state.windDirectionDegrees * Math.PI) / 180,
        windSpeed: this.state.windSpeed,
        smallWaveDamping: this.state.smallWaveDamping,
        spectrumModel: this.state.spectrumModel,
        fetch: this.state.fetch,
        peakEnhancement: this.state.peakEnhancement,
        directionalSpread: this.state.directionalSpread,
        seed: Date.now(),
      });
    };

    const presetFolder = this.gui.addFolder('Presets');
    const presetOptions = Object.fromEntries(
      OCEAN_PRESET_IDS.map((id) => [OCEAN_PRESETS[id].label, id]),
    );
    presetFolder
      .add(this.state, 'preset', presetOptions)
      .name('Sea state')
      .onChange((presetId: OceanPresetId) => {
        const preset = OCEAN_PRESETS[presetId];
        this.state.spectrumModel = preset.spectrumModel;
        this.state.amplitude = preset.amplitude;
        this.state.windSpeed = preset.windSpeed;
        this.state.windDirectionDegrees = preset.windDirection;
        this.state.fetch = preset.fetch;
        this.state.peakEnhancement = preset.peakEnhancement;
        this.state.directionalSpread = preset.directionalSpread;
        this.state.smallWaveDamping = preset.smallWaveDamping;
        this.state.choppiness = preset.choppiness;
        this.state.heightScale = preset.heightScale;
        this.state.timeScale = preset.timeScale;
        refreshGuiDisplays(this.gui);
        water.setHeightScale(preset.heightScale);
        simulation.setParameters({
          spectrumModel: preset.spectrumModel,
          amplitude: preset.amplitude,
          windSpeed: preset.windSpeed,
          windDirection: (preset.windDirection * Math.PI) / 180,
          fetch: preset.fetch,
          peakEnhancement: preset.peakEnhancement,
          directionalSpread: preset.directionalSpread,
          smallWaveDamping: preset.smallWaveDamping,
          choppiness: preset.choppiness,
          heightScale: preset.heightScale,
          timeScale: preset.timeScale,
          seed: Date.now(),
        });
      });

    const spectrumFolder = this.gui.addFolder('Spectrum');
    spectrumFolder
      .add(this.state, 'spectrumModel', { Phillips: 'phillips', JONSWAP: 'jonswap' })
      .name('Model')
      .onFinishChange(syncSpectrum);
    spectrumFolder.add(this.state, 'amplitude', 0.0001, 0.005, 0.0001).name('Amplitude').decimals(4).onFinishChange(syncSpectrum);
    spectrumFolder.add(this.state, 'windSpeed', 1, 40, 0.1).name('Wind speed').decimals(1).onFinishChange(syncSpectrum);
    spectrumFolder
      .add(this.state, 'windDirectionDegrees', 0, 360, 1)
      .name('Wind direction')
      .decimals(0)
      .onFinishChange(syncSpectrum);
    spectrumFolder.add(this.state, 'fetch', 10_000, 1_000_000, 1000).name('Fetch (m)').decimals(0).onFinishChange(syncSpectrum);
    spectrumFolder.add(this.state, 'peakEnhancement', 1, 6, 0.1).name('Peak γ').decimals(1).onFinishChange(syncSpectrum);
    spectrumFolder.add(this.state, 'directionalSpread', 1, 16, 0.25).name('Spread s').decimals(2).onFinishChange(syncSpectrum);
    spectrumFolder
      .add(this.state, 'smallWaveDamping', 0.001, 0.1, 0.001)
      .name('Tiny-wave damping')
      .decimals(3)
      .onFinishChange(syncSpectrum);

    this.gui.add(this.state, 'timeScale', 0, 4, 0.01).name('Time scale').decimals(2).onChange((value: number) => {
      simulation.setParameters({ timeScale: value });
    });
    this.gui
      .add(this.state, 'heightScale', 0.5, 2, 0.05)
      .name('Height scale')
      .decimals(2)
      .onChange((value: number) => {
        simulation.setParameters({ heightScale: value });
        water.setHeightScale(value);
      });
    this.gui.add(this.state, 'choppiness', 0, 1.5, 0.01).name('Choppiness').decimals(2).onChange((value: number) => {
      simulation.setParameters({ choppiness: value });
    });

    const debugFolder = this.gui.addFolder('Debug views');
    debugFolder
      .add(this.state, 'debugView', {
        Off: 'off',
        Height: 'height',
        Displacement: 'displacement',
        Normal: 'normal',
        Jacobian: 'jacobian',
      })
      .name('Texture')
      .onChange((mode: DebugTextureMode) => {
        debugView.setMode(mode);
      });

    water.setHeightScale(this.state.heightScale);
  }

  dispose(): void {
    this.gui.destroy();
  }
}
