import * as THREE from 'three/webgpu';
import { Fn, attributeArray, compute, ivec2, instanceIndex, storage, storageTexture, texture, textureStore, uniform, wgslFn } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
import { GpuFFT } from '../fft/GpuFFT';
import { createInitialSpectrum } from '../spectrum/index';
import type { SpectrumParameters } from '../spectrum/types';

function uintUniform(value: number): Node {
  return uniform(value, 'uint' as 'float') as unknown as Node;
}

// Converts FFT output to world-unit height (meters) before the height-scale slider.
const CPU_HEIGHT_GAIN = 6;
// Horizontal choppy displacement is scaled down — full Tessendorf lambda folds the mesh easily.
const CHOPPINESS_DISPLACEMENT_GAIN = 0.08;
const MIN_WAVE_NUMBER = 1e-6;

export type OceanSimulationParameters = SpectrumParameters & {
  heightScale: number;
  timeScale: number;
  choppiness: number;
};

type EvolveKernelParams = {
  h0: Node;
  target: Node;
  index: typeof instanceIndex;
  time: Node;
  resolution: Node;
  patchSize: Node;
  gravity: Node;
};

type RealKernelParams = {
  source: Node;
  target: Node;
  heights: Node;
  index: typeof instanceIndex;
  resolution: Node;
};

const evolveSpectrumKernel = wgslFn<EvolveKernelParams>(`
fn evolveSpectrum(
  h0: texture_2d<f32>,
  target: texture_storage_2d<rgba32float, write>,
  index: u32,
  time: f32,
  resolution: u32,
  patchSize: f32,
  gravity: f32
) -> void {
  let x = index % resolution;
  let y = index / resolution;

  if (x >= resolution || y >= resolution) {
    return;
  }

  let coord = vec2<i32>(i32(x), i32(y));
  let source = textureLoad(h0, coord, 0);
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
  source: texture_2d<f32>,
  target: texture_storage_2d<rgba32float, write>,
  heights: ptr<storage, array<vec4<f32>>, read_write>,
  index: u32,
  resolution: u32
) -> void {
  let x = index % resolution;
  let y = index / resolution;

  if (x >= resolution || y >= resolution) {
    return;
  }

  let coord = vec2<i32>(i32(x), i32(y));
  let value = textureLoad(source, coord, 0).x;
  let checker = select(-1.0, 1.0, ((x + y) & 1u) == 0u);
  let normalized = value * checker / f32(resolution * resolution);
  let index = y * resolution + x;
  heights[index] = vec4<f32>(normalized, 0.0, 0.0, 1.0);

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

function createSimulationDataTexture(
  resolution: number,
  data: Float32Array,
): THREE.DataTexture {
  const result = new THREE.DataTexture(
    data,
    resolution,
    resolution,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  result.minFilter = THREE.NearestFilter;
  result.magFilter = THREE.NearestFilter;
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  result.generateMipmaps = false;
  result.needsUpdate = true;
  return result;
}

export class OceanSimulation {
  /** RGBA displacement field: R = horizontal X, G = height, B = horizontal Z. */
  readonly displacementDataTexture: THREE.DataTexture;
  /** RGBA encoded world-space normal in [0, 1]. */
  readonly normalDataTexture: THREE.DataTexture;
  /** R = Jacobian determinant J; higher compression (foam potential) when J < 1. */
  readonly jacobianDataTexture: THREE.DataTexture;
  /** Milestone 1 height-only texture kept for debug views. */
  readonly heightDataTexture: THREE.DataTexture;
  readonly heightTexture: THREE.StorageTexture;
  readonly heightBuffer: THREE.StorageBufferAttribute;
  readonly spectrumTexture: THREE.StorageTexture;
  readonly parameters: OceanSimulationParameters;

  private spectrumData: Float32Array;
  private readonly cpuSpectrum: Float32Array;
  private readonly cpuDisplacementX: Float32Array;
  private readonly cpuDisplacementZ: Float32Array;
  private readonly fftScratch: Float32Array;
  private readonly heightPixels: Float32Array;
  private readonly displacementPixels: Float32Array;
  private readonly normalPixels: Float32Array;
  private readonly jacobianPixels: Float32Array;
  private readonly h0Texture: THREE.StorageTexture;
  private readonly evolvedSpectrumTexture: THREE.StorageTexture;
  readonly spatialSpectrumTexture: THREE.StorageTexture;
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
    this.heightPixels = new Float32Array(vertexCount * 4);
    this.displacementPixels = new Float32Array(vertexCount * 4);
    this.normalPixels = new Float32Array(vertexCount * 4);
    this.jacobianPixels = new Float32Array(vertexCount * 4);
    this.heightDataTexture = createSimulationDataTexture(resolution, this.heightPixels);
    this.displacementDataTexture = createSimulationDataTexture(resolution, this.displacementPixels);
    this.normalDataTexture = createSimulationDataTexture(resolution, this.normalPixels);
    this.jacobianDataTexture = createSimulationDataTexture(resolution, this.jacobianPixels);
    this.heightBuffer = new THREE.StorageBufferAttribute(vertexCount, 4);
    this.spectrumData = new Float32Array(vertexCount * 4);
    this.cpuSpectrum = new Float32Array(vertexCount * 2);
    this.cpuDisplacementX = new Float32Array(vertexCount * 2);
    this.cpuDisplacementZ = new Float32Array(vertexCount * 2);
    this.fftScratch = new Float32Array(resolution * 2);
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
      next.smallWaveDamping !== undefined ||
      next.spectrumModel !== undefined ||
      next.fetch !== undefined ||
      next.peakEnhancement !== undefined ||
      next.directionalSpread !== undefined ||
      next.seed !== undefined
    ) {
      this.uploadSpectrumData(this.parameters);
      void this.renderer?.computeAsync(this.uploadH0Node);
    }
  }

  async update(renderer: THREE.WebGPURenderer, deltaSeconds: number): Promise<void> {
    void renderer;
    void this.fft;
    void this.evolveNode;
    void this.heightNode;

    this.elapsed += deltaSeconds * this.parameters.timeScale;
    this.timeUniform.value = this.elapsed;

    this.updateCpuSurfaceFields();
  }

  dispose(): void {
    this.h0Texture.dispose();
    this.spectrumTexture.dispose();
    this.spatialSpectrumTexture.dispose();
    this.heightTexture.dispose();
    this.heightDataTexture.dispose();
    this.displacementDataTexture.dispose();
    this.normalDataTexture.dispose();
    this.jacobianDataTexture.dispose();
    this.fftPing.dispose();
    this.fftPong.dispose();
  }

  private uploadSpectrumData(parameters: SpectrumParameters): void {
    const spectrum = createInitialSpectrum(parameters);
    this.spectrumData = spectrum.data;
    (this.h0Buffer.value.array as Float32Array).set(spectrum.data);
    this.h0Buffer.value.needsUpdate = true;
  }

  private updateCpuSurfaceFields(): void {
    const { resolution, patchSize, gravity, choppiness } = this.parameters;
    const twoPiOverLength = (2 * Math.PI) / patchSize;

    for (let y = 0; y < resolution; y += 1) {
      const centeredY = y - resolution / 2;

      for (let x = 0; x < resolution; x += 1) {
        const centeredX = x - resolution / 2;
        const spectrumIndex = (y * resolution + x) * 4;
        const outputIndex = (y * resolution + x) * 2;
        const kx = centeredX * twoPiOverLength;
        const kz = centeredY * twoPiOverLength;
        const kLength = Math.hypot(kx, kz);
        const omega = Math.sqrt(gravity * kLength);
        const phase = omega * this.elapsed;
        const cosPhase = Math.cos(phase);
        const sinPhase = Math.sin(phase);
        const h0r = this.spectrumData[spectrumIndex] ?? 0;
        const h0i = this.spectrumData[spectrumIndex + 1] ?? 0;
        const h0MinusR = this.spectrumData[spectrumIndex + 2] ?? 0;
        const h0MinusI = this.spectrumData[spectrumIndex + 3] ?? 0;

        const positiveR = h0r * cosPhase - h0i * sinPhase;
        const positiveI = h0r * sinPhase + h0i * cosPhase;
        const negativeR = h0MinusR * cosPhase + h0MinusI * sinPhase;
        const negativeI = -h0MinusR * sinPhase + h0MinusI * cosPhase;
        const heightR = positiveR + negativeR;
        const heightI = positiveI + negativeI;

        this.cpuSpectrum[outputIndex] = heightR;
        this.cpuSpectrum[outputIndex + 1] = heightI;

        if (kLength > MIN_WAVE_NUMBER) {
          // Tessendorf choppy displacement: Dx(k) = -i * (kx/|k|) * lambda * H(k).
          const invK = (choppiness * CHOPPINESS_DISPLACEMENT_GAIN) / kLength;
          const dispFactorX = invK * kx;
          const dispFactorZ = invK * kz;

          this.cpuDisplacementX[outputIndex] = dispFactorX * heightI;
          this.cpuDisplacementX[outputIndex + 1] = -dispFactorX * heightR;
          this.cpuDisplacementZ[outputIndex] = dispFactorZ * heightI;
          this.cpuDisplacementZ[outputIndex + 1] = -dispFactorZ * heightR;
        } else {
          this.cpuDisplacementX[outputIndex] = 0;
          this.cpuDisplacementX[outputIndex + 1] = 0;
          this.cpuDisplacementZ[outputIndex] = 0;
          this.cpuDisplacementZ[outputIndex + 1] = 0;
        }
      }
    }

    this.inverseFft2D(this.cpuSpectrum);
    this.inverseFft2D(this.cpuDisplacementX);
    this.inverseFft2D(this.cpuDisplacementZ);

    const heights = new Float32Array(resolution * resolution);
    const displacementsX = new Float32Array(resolution * resolution);
    const displacementsZ = new Float32Array(resolution * resolution);

    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const sourceIndex = (y * resolution + x) * 2;
        const pixelIndex = (y * resolution + x) * 4;
        const gridIndex = y * resolution + x;
        const checker = (x + y) % 2 === 0 ? 1 : -1;
        const normalization = (checker * CPU_HEIGHT_GAIN) / (resolution * resolution);
        const height = (this.cpuSpectrum[sourceIndex] ?? 0) * normalization;
        const displacementX = (this.cpuDisplacementX[sourceIndex] ?? 0) * normalization;
        const displacementZ = (this.cpuDisplacementZ[sourceIndex] ?? 0) * normalization;

        heights[gridIndex] = height;
        displacementsX[gridIndex] = displacementX;
        displacementsZ[gridIndex] = displacementZ;

        this.heightPixels[pixelIndex] = height;
        this.heightPixels[pixelIndex + 1] = height;
        this.heightPixels[pixelIndex + 2] = height;
        this.heightPixels[pixelIndex + 3] = 1;

        this.displacementPixels[pixelIndex] = displacementX;
        this.displacementPixels[pixelIndex + 1] = height;
        this.displacementPixels[pixelIndex + 2] = displacementZ;
        this.displacementPixels[pixelIndex + 3] = 1;
      }
    }

    this.computeSurfaceNormals(
      resolution,
      patchSize,
      heights,
      displacementsX,
      displacementsZ,
      this.normalPixels,
    );
    this.computeJacobianField(
      resolution,
      patchSize,
      displacementsX,
      displacementsZ,
      this.jacobianPixels,
    );

    this.heightDataTexture.needsUpdate = true;
    this.displacementDataTexture.needsUpdate = true;
    this.normalDataTexture.needsUpdate = true;
    this.jacobianDataTexture.needsUpdate = true;
  }

  /** Tessendorf displacement Jacobian: J = (1+∂Dx/∂x)(1+∂Dz/∂z) − (∂Dx/∂z)(∂Dz/∂x). */
  private computeJacobianField(
    resolution: number,
    patchSize: number,
    displacementsX: Float32Array,
    displacementsZ: Float32Array,
    target: Float32Array,
  ): void {
    const cellSize = patchSize / resolution;
    const invTwoCell = 1 / (2 * cellSize);

    const sample = (field: Float32Array, x: number, y: number): number => {
      const wrappedX = ((x % resolution) + resolution) % resolution;
      const wrappedY = ((y % resolution) + resolution) % resolution;
      return field[wrappedY * resolution + wrappedX] ?? 0;
    };

    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const pixelIndex = (y * resolution + x) * 4;
        const dDxDx =
          (sample(displacementsX, x + 1, y) - sample(displacementsX, x - 1, y)) * invTwoCell;
        const dDxDz =
          (sample(displacementsX, x, y + 1) - sample(displacementsX, x, y - 1)) * invTwoCell;
        const dDzDx =
          (sample(displacementsZ, x + 1, y) - sample(displacementsZ, x - 1, y)) * invTwoCell;
        const dDzDz =
          (sample(displacementsZ, x, y + 1) - sample(displacementsZ, x, y - 1)) * invTwoCell;
        const jacobian = (1 + dDxDx) * (1 + dDzDz) - dDxDz * dDzDx;

        target[pixelIndex] = jacobian;
        target[pixelIndex + 1] = Math.max(0, 1 - jacobian);
        target[pixelIndex + 2] = 0;
        target[pixelIndex + 3] = 1;
      }
    }
  }

  private computeSurfaceNormals(
    resolution: number,
    patchSize: number,
    heights: Float32Array,
    displacementsX: Float32Array,
    displacementsZ: Float32Array,
    target: Float32Array,
  ): void {
    const cellSize = patchSize / resolution;
    const halfPatch = patchSize * 0.5;
    const left = new THREE.Vector3();
    const right = new THREE.Vector3();
    const down = new THREE.Vector3();
    const up = new THREE.Vector3();
    const tangentX = new THREE.Vector3();
    const tangentZ = new THREE.Vector3();
    const normal = new THREE.Vector3();

    const writePosition = (
      vector: THREE.Vector3,
      x: number,
      y: number,
    ): void => {
      const wrappedX = ((x % resolution) + resolution) % resolution;
      const wrappedY = ((y % resolution) + resolution) % resolution;
      const index = wrappedY * resolution + wrappedX;

      vector.set(
        (wrappedX / resolution) * patchSize - halfPatch + (displacementsX[index] ?? 0),
        heights[index] ?? 0,
        (wrappedY / resolution) * patchSize - halfPatch + (displacementsZ[index] ?? 0),
      );
    };

    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const pixelIndex = (y * resolution + x) * 4;

        writePosition(left, x - 1, y);
        writePosition(right, x + 1, y);
        writePosition(down, x, y - 1);
        writePosition(up, x, y + 1);

        tangentX.subVectors(right, left).divideScalar(cellSize * 2);
        tangentZ.subVectors(up, down).divideScalar(cellSize * 2);
        normal.crossVectors(tangentZ, tangentX).normalize();

        if (normal.y < 0) {
          normal.negate();
        }

        target[pixelIndex] = normal.x * 0.5 + 0.5;
        target[pixelIndex + 1] = normal.y * 0.5 + 0.5;
        target[pixelIndex + 2] = normal.z * 0.5 + 0.5;
        target[pixelIndex + 3] = 1;
      }
    }
  }

  private inverseFft2D(data: Float32Array): void {
    const { resolution } = this.parameters;

    for (let y = 0; y < resolution; y += 1) {
      const rowOffset = y * resolution * 2;

      for (let x = 0; x < resolution; x += 1) {
        this.fftScratch[x * 2] = data[rowOffset + x * 2] ?? 0;
        this.fftScratch[x * 2 + 1] = data[rowOffset + x * 2 + 1] ?? 0;
      }

      this.inverseFft1D(this.fftScratch);

      for (let x = 0; x < resolution; x += 1) {
        data[rowOffset + x * 2] = this.fftScratch[x * 2] ?? 0;
        data[rowOffset + x * 2 + 1] = this.fftScratch[x * 2 + 1] ?? 0;
      }
    }

    for (let x = 0; x < resolution; x += 1) {
      for (let y = 0; y < resolution; y += 1) {
        const sourceIndex = (y * resolution + x) * 2;
        this.fftScratch[y * 2] = data[sourceIndex] ?? 0;
        this.fftScratch[y * 2 + 1] = data[sourceIndex + 1] ?? 0;
      }

      this.inverseFft1D(this.fftScratch);

      for (let y = 0; y < resolution; y += 1) {
        const targetIndex = (y * resolution + x) * 2;
        data[targetIndex] = this.fftScratch[y * 2] ?? 0;
        data[targetIndex + 1] = this.fftScratch[y * 2 + 1] ?? 0;
      }
    }
  }

  private inverseFft1D(data: Float32Array): void {
    const { resolution } = this.parameters;

    for (let i = 1, j = 0; i < resolution; i += 1) {
      let bit = resolution >> 1;

      for (; (j & bit) !== 0; bit >>= 1) {
        j ^= bit;
      }

      j ^= bit;

      if (i < j) {
        const iR = i * 2;
        const jR = j * 2;
        const real = data[iR] ?? 0;
        const imag = data[iR + 1] ?? 0;

        data[iR] = data[jR] ?? 0;
        data[iR + 1] = data[jR + 1] ?? 0;
        data[jR] = real;
        data[jR + 1] = imag;
      }
    }

    for (let length = 2; length <= resolution; length <<= 1) {
      const halfLength = length >> 1;
      const angleStep = (2 * Math.PI) / length;

      for (let start = 0; start < resolution; start += length) {
        for (let offset = 0; offset < halfLength; offset += 1) {
          const evenIndex = (start + offset) * 2;
          const oddIndex = (start + offset + halfLength) * 2;
          const angle = angleStep * offset;
          const wr = Math.cos(angle);
          const wi = Math.sin(angle);
          const oddR = data[oddIndex] ?? 0;
          const oddI = data[oddIndex + 1] ?? 0;
          const rotatedR = wr * oddR - wi * oddI;
          const rotatedI = wr * oddI + wi * oddR;
          const evenR = data[evenIndex] ?? 0;
          const evenI = data[evenIndex + 1] ?? 0;

          data[evenIndex] = evenR + rotatedR;
          data[evenIndex + 1] = evenI + rotatedI;
          data[oddIndex] = evenR - rotatedR;
          data[oddIndex + 1] = evenI - rotatedI;
        }
      }
    }
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
    return compute(
      (evolveSpectrumKernel as any)(
        texture(this.h0Texture) as unknown as Node,
        storageTexture(this.evolvedSpectrumTexture).toWriteOnly() as unknown as Node,
        instanceIndex,
        this.timeUniform as unknown as Node,
        uintUniform(this.parameters.resolution),
        uniform(this.parameters.patchSize) as unknown as Node,
        uniform(this.parameters.gravity) as unknown as Node,
      ) as Node,
      this.parameters.resolution * this.parameters.resolution,
      [64],
    );
  }

  private createHeightNode(
    source: THREE.Texture,
    target: THREE.StorageTexture,
  ): ComputeNode {
    return compute(
      (complexToHeightKernel as any)(
        texture(source) as unknown as Node,
        storageTexture(target).toWriteOnly() as unknown as Node,
        storage(this.heightBuffer, 'vec4', this.parameters.resolution * this.parameters.resolution) as unknown as Node,
        instanceIndex,
        uintUniform(this.parameters.resolution),
      ) as Node,
      this.parameters.resolution * this.parameters.resolution,
      [64],
    );
  }
}
