# Spectral Ocean Simulation

Milestone 5 adds physically motivated crest foam: Jacobian compression drives deposition into a persistent foam texture with exponential decay, and the water shader renders accumulated foam at wave crests. Milestone 4’s three-cascade spectral ocean (swell, mid waves, ripples), JONSWAP presets, and debug texture views remain.

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

- `src/ocean/spectrum` — Phillips and JONSWAP initial spectra, directional spreading, and named presets.
- `src/ocean/simulation/OceanSimulation` — single-band spectral evolution, CPU inverse FFT, displacement/normal/Jacobian textures.
- `src/ocean/simulation/OceanCascadeSystem` — three `OceanSimulation` instances merged in world space; drives `FoamAccumulator` from combined Jacobian.
- `src/ocean/foam` — persistent crest foam accumulation and decay (`FoamAccumulator`).
- `src/ocean/fft` — separable inverse FFT module for a future GPU-only path.
- `src/ocean/rendering` — water mesh displaced and shaded from combined cascade textures plus foam map.
- `src/ocean/debug` — lil-gui controls (global, per-cascade, foam) and a camera-attached texture preview.
- `src/demo` — WebGPU scene, orbit camera, stats panel.

## GPU Data Flow

1. Each cascade builds `h0(k)` from the shared spectrum model with band-specific amplitude, patch size, and wind coupling.
2. Per cascade, `H(k, t)` evolves and inverse FFT produces η, `Dx`, `Dz`.
3. `OceanCascadeSystem` tiles each band in world space, sums displacements, and rebuilds normals and Jacobian on the combined field.
4. `FoamAccumulator` reads combined Jacobian compression, deposits foam where `1 − J` exceeds a threshold, and decays stored foam each frame.
5. The water material samples merged displacement/normals and the foam texture; debug can show height, displacement, normal, Jacobian, or foam.

Compute kernels for spectrum upload and evolution remain wired per cascade for a future GPU-only update path.

## Milestone 5 Scope

Implemented:

- Jacobian-based breaking detection on the combined choppy displacement field.
- Persistent foam texture with per-frame accumulation and exponential decay.
- Crest foam rendering on the water surface (world-space UV sampling).
- Debug UI: foam threshold, accumulation, decay, coverage, render strength, clear foam; foam texture debug view.

Deferred to later milestones:

- Shoreline foam and object wake foam.
- Buoyancy sampling (Milestone 6).
- Full water shading with reflection/refraction/absorption (Milestone 7).
