import * as THREE from 'three/webgpu';
import { compute, instanceIndex, storageTexture, texture, uniform, wgslFn } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';

type FftKernelParams = {
  source: Node;
  target: Node;
  index: typeof instanceIndex;
  resolution: Node;
  stage: Node;
  horizontal: Node;
};

function uintUniform(value: number): Node {
  return uniform(value, 'uint' as 'float') as unknown as Node;
}

const bitReverseKernel = wgslFn<FftKernelParams>(`
fn bitReversePass(
  source: texture_2d<f32>,
  target: texture_storage_2d<rgba32float, write>,
  index: u32,
  resolution: u32,
  stage: u32,
  horizontal: u32
) -> void {
  let x = index % resolution;
  let y = index / resolution;

  if (x >= resolution || y >= resolution) {
    return;
  }

  var reversed = 0u;
  var value = select(y, x, horizontal == 1u);

  for (var bit = 0u; bit < stage; bit = bit + 1u) {
    reversed = (reversed << 1u) | (value & 1u);
    value = value >> 1u;
  }

  let readCoord = select(
    vec2<i32>(i32(x), i32(reversed)),
    vec2<i32>(i32(reversed), i32(y)),
    horizontal == 1u
  );
  let v = textureLoad(source, readCoord, 0);
  textureStore(target, vec2<i32>(i32(x), i32(y)), v);
}
`);

const fftStageKernel = wgslFn<FftKernelParams>(`
fn fftStagePass(
  source: texture_2d<f32>,
  target: texture_storage_2d<rgba32float, write>,
  index: u32,
  resolution: u32,
  stage: u32,
  horizontal: u32
) -> void {
  let x = index % resolution;
  let y = index / resolution;

  if (x >= resolution || y >= resolution) {
    return;
  }

  let index = select(y, x, horizontal == 1u);
  let span = 1u << stage;
  let halfSpan = span >> 1u;
  let localIndex = index & (span - 1u);
  let pairOffset = localIndex & (halfSpan - 1u);
  let blockStart = index - localIndex;
  let evenIndex = blockStart + pairOffset;
  let oddIndex = evenIndex + halfSpan;

  let evenCoord = select(
    vec2<i32>(i32(x), i32(evenIndex)),
    vec2<i32>(i32(evenIndex), i32(y)),
    horizontal == 1u
  );
  let oddCoord = select(
    vec2<i32>(i32(x), i32(oddIndex)),
    vec2<i32>(i32(oddIndex), i32(y)),
    horizontal == 1u
  );

  let a = textureLoad(source, evenCoord, 0).xy;
  let b = textureLoad(source, oddCoord, 0).xy;

  // Positive sign gives the inverse transform convention used by Tessendorf.
  let angle = 6.28318530718 * f32(pairOffset) / f32(span);
  let twiddle = vec2<f32>(cos(angle), sin(angle));
  let rotated = vec2<f32>(
    twiddle.x * b.x - twiddle.y * b.y,
    twiddle.x * b.y + twiddle.y * b.x
  );
  let result = select(a - rotated, a + rotated, localIndex < halfSpan);

  textureStore(target, vec2<i32>(i32(x), i32(y)), vec4<f32>(result, 0.0, 1.0));
}
`);

function makePass(
  source: THREE.Texture,
  target: THREE.StorageTexture,
  resolution: number,
  stage: number,
  horizontal: boolean,
  kernel: typeof bitReverseKernel,
): ComputeNode {
  return compute(
    (kernel as any)(
      texture(source) as unknown as Node,
      storageTexture(target).toWriteOnly() as unknown as Node,
      instanceIndex,
      uintUniform(resolution),
      uintUniform(stage),
      uintUniform(horizontal ? 1 : 0),
    ) as Node,
    resolution * resolution,
    [64],
  );
}

export class GpuFFT {
  readonly resolution: number;
  private readonly logResolution: number;
  private readonly ping: THREE.StorageTexture;
  private readonly pong: THREE.StorageTexture;
  private cachedPlan: ComputeNode[] | null = null;
  private cachedSource: THREE.Texture | null = null;
  private cachedTarget: THREE.StorageTexture | null = null;

  constructor(resolution: number, ping: THREE.StorageTexture, pong: THREE.StorageTexture) {
    if ((resolution & (resolution - 1)) !== 0) {
      throw new Error('GpuFFT resolution must be a power of two.');
    }

    this.resolution = resolution;
    this.logResolution = Math.log2(resolution);
    this.ping = ping;
    this.pong = pong;
  }

  async inverse2D(
    renderer: THREE.WebGPURenderer,
    source: THREE.Texture,
    target: THREE.StorageTexture,
  ): Promise<THREE.Texture> {
    const plan = this.getPlan(source, target);

    for (const pass of plan) {
      await renderer.computeAsync(pass);
    }

    return target;
  }

  private getPlan(source: THREE.Texture, target: THREE.StorageTexture): ComputeNode[] {
    if (this.cachedPlan && this.cachedSource === source && this.cachedTarget === target) {
      return this.cachedPlan;
    }

    const plan: ComputeNode[] = [];
    let read: THREE.Texture = source;
    let write = this.ping;

    plan.push(
      makePass(read, write, this.resolution, this.logResolution, true, bitReverseKernel),
    );
    read = write;

    for (let stage = 1; stage <= this.logResolution; stage += 1) {
      write = read === this.ping ? this.pong : this.ping;
      plan.push(
        makePass(read, write, this.resolution, stage, true, fftStageKernel),
      );
      read = write;
    }

    write = read === this.ping ? this.pong : this.ping;
    plan.push(
      makePass(read, write, this.resolution, this.logResolution, false, bitReverseKernel),
    );
    read = write;

    for (let stage = 1; stage <= this.logResolution; stage += 1) {
      const isLastStage = stage === this.logResolution;
      write = isLastStage ? target : read === this.ping ? this.pong : this.ping;
      plan.push(
        makePass(read, write, this.resolution, stage, false, fftStageKernel),
      );
      read = write;
    }

    this.cachedPlan = plan;
    this.cachedSource = source;
    this.cachedTarget = target;

    return plan;
  }
}
