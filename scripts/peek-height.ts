import { createDefaultCascadeSystemParameters } from '../src/ocean/simulation/cascadeConfig.ts';
import { OCEAN_PRESETS } from '../src/ocean/spectrum/presets.ts';
import { OceanCascadeSystem } from '../src/ocean/simulation/OceanCascadeSystem.ts';

const fake = {} as import('three/webgpu').WebGPURenderer;
const system = new OceanCascadeSystem(createDefaultCascadeSystemParameters());
system.applyPreset(OCEAN_PRESETS.windySea, (40 * Math.PI) / 180);

for (let i = 0; i < 40; i += 1) {
  system.update(fake, 1 / 60);
}

const data = system.displacementDataTexture.image.data as Float32Array;
const resolution = 256;
let max = 0;
let min = 0;
let significant = 0;

for (let y = 0; y < resolution; y += 1) {
  for (let x = 0; x < resolution; x += 1) {
    const h = data[(y * resolution + x) * 4 + 1] ?? 0;
    min = Math.min(min, h);
    max = Math.max(max, h);
    if (Math.abs(h) > 0.35) {
      significant += 1;
    }
  }
}

const center = data[(128 * resolution + 128) * 4 + 1] ?? 0;
const corner = data[1] ?? 0;

console.log('windySea CPU heights:', {
  min: min.toFixed(2),
  max: max.toFixed(2),
  center: center.toFixed(2),
  corner: corner.toFixed(2),
  pixelsAbove0_35m: significant,
});
