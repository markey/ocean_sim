# Spectral Ocean Simulation

Milestone 1 is a Three.js WebGPU proof of life for a Tessendorf-style spectral ocean. The demo generates an initial Phillips wave spectrum, evolves that spectrum on the GPU, runs a 256x256 inverse FFT with ping-pong storage textures, and displaces a water mesh from the generated height field.

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL in a browser with WebGPU support, preferably current Chrome or Edge.

Useful checks:

```bash
npm run typecheck
npm run build
```

## Architecture

- `src/ocean/spectrum` creates deterministic Gaussian noise and a Phillips spectrum on the CPU. This is initialization data only.
- `src/ocean/simulation` owns the GPU textures and the update API. Each frame runs spectrum evolution, inverse FFT, and conversion to a real height texture.
- `src/ocean/fft` implements the separable inverse FFT. It uses bit-reversal passes plus horizontal and vertical butterfly passes, always ping-ponging between textures so a pass never reads and writes the same texture.
- `src/ocean/rendering` builds the water mesh and node material. Milestone 1 uses vertical displacement only from the GPU height texture.
- `src/demo` contains scene setup, WebGPU capability handling, orbit controls, debug GUI, and a small FPS panel.

## GPU Data Flow

1. CPU creates `h0(k)` and conjugate `h0(-k)` data in a float `DataTexture`.
2. A WebGPU compute pass evolves the complex spectrum with the deep-water dispersion relation.
3. The FFT module runs horizontal and vertical inverse FFT passes through float storage textures.
4. A final compute pass normalizes the real component and applies checkerboard sign correction for the centered spectrum.
5. The water material samples the height texture in the vertex stage and moves the mesh vertically.

The compute kernels are authored with `wgslFn` and dispatched through Three.js TSL `compute()`/`renderer.computeAsync()`. This keeps the app inside Three's WebGPU resource model while avoiding fragile node-graph code for loop-heavy FFT math.

## Milestone 1 Scope

Implemented:

- TypeScript, Vite, Three.js WebGPU.
- 256x256 spectral simulation with Phillips spectrum initialization.
- GPU spectrum evolution and inverse FFT pipeline.
- Water mesh displaced by the generated height field.
- Orbit camera, debug controls, and performance readout.

Deferred to later milestones:

- Horizontal choppy displacement.
- Slope/normal textures.
- Jacobian and foam accumulation.
- Multi-cascade spectrum.
- Buoyancy sampling.
- Full water shading with reflection/refraction/absorption.
