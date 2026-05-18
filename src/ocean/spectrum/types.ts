export type SpectrumParameters = {
  resolution: number;
  patchSize: number;
  amplitude: number;
  windSpeed: number;
  windDirection: number;
  gravity: number;
  smallWaveDamping: number;
  seed: number;
};

export type SpectrumData = {
  data: Float32Array;
  parameters: SpectrumParameters;
};
