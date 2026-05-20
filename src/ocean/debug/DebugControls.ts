import GUI from 'lil-gui';
import type { OceanSimulation, OceanSimulationParameters } from '../simulation/OceanSimulation';
import type { WaterMesh } from '../rendering/WaterMesh';

export class DebugControls {
  readonly gui: GUI;

  constructor(
    parameters: OceanSimulationParameters,
    simulation: OceanSimulation,
    water: WaterMesh,
  ) {
    this.gui = new GUI({ title: 'Spectral Ocean' });

    const syncSpectrum = () => {
      simulation.setParameters({
        amplitude: parameters.amplitude,
        windDirection: (parameters.windDirection * Math.PI) / 180,
        windSpeed: parameters.windSpeed,
        smallWaveDamping: parameters.smallWaveDamping,
      });
    };

    this.gui.add(parameters, 'amplitude', 0.0001, 0.005, 0.0001).name('Amplitude').decimals(4).onFinishChange(syncSpectrum);
    this.gui.add(parameters, 'windSpeed', 1, 40, 0.1).name('Wind speed').decimals(1).onFinishChange(syncSpectrum);
    this.gui.add(parameters, 'windDirection', 0, 360, 1).name('Wind direction').decimals(0).onFinishChange(syncSpectrum);
    this.gui.add(parameters, 'timeScale', 0, 4, 0.01).name('Time scale').decimals(2).onChange((value: number) => {
      simulation.setParameters({ timeScale: value });
    });
    this.gui.add(parameters, 'heightScale', 0, 3, 0.01).name('Height scale').decimals(2).onChange((value: number) => {
      water.setHeightScale(value);
      simulation.setParameters({ heightScale: value });
    });
    this.gui.add(parameters, 'smallWaveDamping', 0.001, 0.1, 0.001).name('Tiny-wave damping').decimals(3).onFinishChange(syncSpectrum);

    water.setHeightScale(parameters.heightScale);
  }

  dispose(): void {
    this.gui.destroy();
  }
}
