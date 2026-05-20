import * as THREE from 'three/webgpu';
import { Fn, attributeArray, compute, globalId, ivec2, instanceIndex, storageTexture, textureStore, uniform, wgslFn } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
import { GpuFFT } from '../fft/GpuFFT';
import { createInitialSpectrum } from '../spectrum/phillips';
import type { SpectrumParameters } from '../spectrum/types';

const WORKGROUP_SIZE = 8;
const compute2D = compute as unknown as (
  node: Node,
  dispatchSize: number[],
  workgroupSize?: number[],
) => ComputeNode;

function uintUniform(value: number): Node {
  return uniform(value, 'uint' as 'float') as unknown as Node;
}

export type OceanSimulationParameters = SpectrumParameters & {
  heightScale: number;
  timeScale: number;
};

type EvolveKernelParams = {
  h0: Node;
  target: Node;
  id: typeof globalId;
  time: Node;
  resolution: Node;
  patchSize: Node;
  gravity: Node;
};

type RealKernelParams = {
  source: Node;
  target: Node;
  id: typeof globalId;
  resolution: Node;
};

const evolveSpectrumKernel = wgslFn<EvolveKernelParams>(`
fn evolveSpectrum(
  h0: texture_storage_2d<rgba32float, read>,
  target: texture_storage_2d<rgba32float, write>,
  id: vec3<u32>,
  time: f32,
  resolution: u32,
  patchSize: f32,
  gravity: f32
) -> void {
  let x = id.x;
  let y = id.y;

  if (x >= resolution || y >= resolution) {
    return;
  }

  let coord = vec2<i32>(i32(x), i32(y));
  let source = textureLoad(h0, coord);
  let centered = vec2<f32>(f32(x), f32(y)) - vec2<f32>(f32(resolution) * 0.5);
  let waveNumber = centered * (6.28318530718 / patchSize);
  let kLength = length(waveNumber);
  let omega = sqrt(gravity * kLength);
  let phase = omega * time;
  let c = cos(phase);
  let s = sin(phase);

  let h0k = source.xy;
  let h0MinusKConj = source.zw;
  let positive = vec2<f32>(h0k.x * c - h0k.y * s, h0k.x * s + h0k.y * c);
  let negative = vec2<f32>(
    h0MinusKConj.x * c + h0MinusKConj.y * s,
    -h0MinusKConj.x * s + h0MinusKConj.y * c
  );
  let h = positive + negative;

  textureStore(target, coord, vec4<f32>(h, 0.0, 1.0));
}
`);

const complexToHeightKernel = wgslFn<RealKernelParams>(`
fn complexToHeight(
  source: texture_storage_2d<rgba32float, read>,
  target: texture_storage_2d<rgba32float, write>,
  id: vec3<u32>,
  resolution: u32
) -> void {
  let x = id.x;
  let y = id.y;

  if (x >= resolution || y >= resolution) {
    return;
  }

  let coord = vec2<i32>(i32(x), i32(y));
  let value = textureLoad(source, coord).x;
  let checker = select(-1.0, 1.0, ((x + y) & 1u) == 0u);
  // Keep Milestone 1's debug output visibly displaced. Physical amplitude
  // calibration can divide by resolution^2 once normals/choppiness land.
  let normalized = value * checker;

  textureStore(target, coord, vec4<f32>(normalized, normalized, normalized, 1.0));
}
`);

function createFloatStorageTexture(resolution: number): THREE.StorageTexture {
  const result = new THREE.StorageTexture(resolution, resolution);
  result.format = THREE.RGBAFormat;
  result.type = THREE.FloatType;
  result.minFilter = THREE.NearestFilter;
  result.magFilter = THREE.NearestFilter;
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  (result as THREE.StorageTexture & { mipmapsAutoUpdate: boolean }).mipmapsAutoUpdate = false;
  result.generateMipmaps = false;
  return result;
}

export class OceanSimulation {
  readonly heightTexture: THREE.StorageTexture;
  readonly spectrumTexture: THREE.StorageTexture;
  readonly parameters: OceanSimulationParameters;

  private readonly h0Texture: THREE.StorageTexture;
  private readonly evolvedSpectrumTexture: THREE.StorageTexture;
  private readonly spatialSpectrumTexture: THREE.StorageTexture;
  private readonly fft: GpuFFT;
  private readonly fftPing: THREE.StorageTexture;
  private readonly fftPong: THREE.StorageTexture;
  private readonly h0Buffer: Node & {
    value: THREE.StorageBufferAttribute;
    element: (index: Node) => Node;
  };
  private renderer: THREE.WebGPURenderer | null = null;
  private elapsed = 0;
  private readonly timeUniform = uniform(0);
  private readonly uploadH0Node: ComputeNode;
  private readonly evolveNode: ComputeNode;
  private readonly heightNode: ComputeNode;

  constructor(parameters: OceanSimulationParameters) {
    this.parameters = { ...parameters };
    const { resolution } = parameters;
    const vertexCount = resolution * resolution;

    this.h0Texture = createFloatStorageTexture(resolution);
    this.spectrumTexture = createFloatStorageTexture(resolution);
    this.evolvedSpectrumTexture = this.spectrumTexture;
    this.spatialSpectrumTexture = createFloatStorageTexture(resolution);
    this.heightTexture = createFloatStorageTexture(resolution);
    this.fftPing = createFloatStorageTexture(resolution);
    this.fftPong = createFloatStorageTexture(resolution);
    this.fft = new GpuFFT(resolution, this.fftPing, this.fftPong);

    this.h0Buffer = attributeArray(vertexCount, 'vec4') as OceanSimulation['h0Buffer'];
    this.uploadH0Node = this.createUploadH0Node();
    this.uploadSpectrumData(parameters);

    this.evolveNode = this.createEvolveNode();
    this.heightNode = this.createHeightNode(this.spatialSpectrumTexture, this.heightTexture);
  }

  async init(renderer: THREE.WebGPURenderer): Promise<void> {
    this.renderer = renderer;
    await renderer.computeAsync(this.uploadH0Node);
  }

  setParameters(next: Partial<OceanSimulationParameters>): void {
    Object.assign(this.parameters, next);

    if (
      next.amplitude !== undefined ||
      next.windDirection !== undefined ||
      next.windSpeed !== undefined ||
      next.smallWaveDamping !== undefined
    ) {
      this.uploadSpectrumData(this.parameters);
      void this.renderer?.computeAsync(this.uploadH0Node);
    }
  }

  async update(renderer: THREE.WebGPURenderer, deltaSeconds: number): Promise<void> {
    this.elapsed += deltaSeconds * this.parameters.timeScale;
    this.timeUniform.value = this.elapsed;

    await renderer.computeAsync(this.evolveNode);
    await this.fft.inverse2D(renderer, this.evolvedSpectrumTexture, this.spatialSpectrumTexture);
    await renderer.computeAsync(this.heightNode);
  }

  dispose(): void {
    this.h0Texture.dispose();
    this.spectrumTexture.dispose();
    this.spatialSpectrumTexture.dispose();
    this.heightTexture.dispose();
    this.fftPing.dispose();
    this.fftPong.dispose();
  }

  private uploadSpectrumData(parameters: SpectrumParameters): void {
    const spectrum = createInitialSpectrum(parameters);
    (this.h0Buffer.value.array as Float32Array).set(spectrum.data);
  }

  private createUploadH0Node(): ComputeNode {
    const resolution = uintUniform(this.parameters.resolution);
    const h0Target = storageTexture(this.h0Texture).toWriteOnly();

    return compute(
      Fn(() => {
        const xIndex = (instanceIndex as any).mod(resolution);
        const yIndex = (instanceIndex as any).div(resolution);
        const value = this.h0Buffer.element(instanceIndex);

        textureStore(h0Target, ivec2(xIndex as any, yIndex as any), value);
      })(),
      this.parameters.resolution * this.parameters.resolution,
      [64],
    );
  }

  private createEvolveNode(): ComputeNode {
    return compute2D(
      evolveSpectrumKernel({
        h0: storageTexture(this.h0Texture).toReadOnly() as unknown as Node,
        target: storageTexture(this.evolvedSpectrumTexture).toWriteOnly() as unknown as Node,
        id: globalId,
        time: this.timeUniform as unknown as Node,
        resolution: uintUniform(this.parameters.resolution),
        patchSize: uniform(this.parameters.patchSize) as unknown as Node,
        gravity: uniform(this.parameters.gravity) as unknown as Node,
      }),
      [
        this.parameters.resolution / WORKGROUP_SIZE,
        this.parameters.resolution / WORKGROUP_SIZE,
      ],
      [WORKGROUP_SIZE, WORKGROUP_SIZE],
    );
  }

  private createHeightNode(
    source: THREE.Texture,
    target: THREE.StorageTexture,
  ): ComputeNode {
    return compute2D(
      complexToHeightKernel({
        source: storageTexture(source).toReadOnly() as unknown as Node,
        target: storageTexture(target).toWriteOnly() as unknown as Node,
        id: globalId,
        resolution: uintUniform(this.parameters.resolution),
      }),
      [
        this.parameters.resolution / WORKGROUP_SIZE,
        this.parameters.resolution / WORKGROUP_SIZE,
      ],
      [WORKGROUP_SIZE, WORKGROUP_SIZE],
    );
  }
}
