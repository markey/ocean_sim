# Spectral Ocean Simulation

Milestone 6 adds buoyancy: a floating sphere and a simple boat sample the simulated ocean height and normals, then ride the waves with spring-damped vertical motion and surface-aligned orientation. Milestone 5 crest foam, Milestone 4 three-cascade spectral ocean, JONSWAP presets, and debug texture views remain.

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
- `src/ocean/buoyancy` — bilinear surface sampling API, floating sphere, and multi-point boat hull.
- `src/ocean/fft` — separable inverse FFT module for a future GPU-only path.
- `src/ocean/rendering` — water mesh displaced and shaded from combined cascade textures plus foam map.
- `src/ocean/debug` — lil-gui controls (global, per-cascade, foam, buoyancy) and a camera-attached texture preview.
- `src/demo` — WebGPU scene, orbit camera, stats panel, floating bodies.

## GPU Data Flow

1. Each cascade builds `h0(k)` from the shared spectrum model with band-specific amplitude, patch size, and wind coupling.
2. Per cascade, `H(k, t)` evolves and inverse FFT produces η, `Dx`, `Dz`.
3. `OceanCascadeSystem` tiles each band in world space, sums displacements, and rebuilds normals and Jacobian on the combined field.
4. `FoamAccumulator` reads combined Jacobian compression, deposits foam where `1 − J` exceeds a threshold, and decays stored foam each frame.
5. The water material samples merged displacement/normals and the foam texture; debug can show height, displacement, normal, Jacobian, or foam.
6. `OceanSurfaceSampler` reads the same combined CPU displacement/normal textures for buoyancy at arbitrary world XZ points.

Compute kernels for spectrum upload and evolution remain wired per cascade for a future GPU-only update path.

## Milestone 6 Scope

Implemented:

- `sampleOceanSurface` / `sampleOceanSurfacePoint` — bilinear height, chop, and normal from the merged simulation field.
- Floating sphere with vertical spring-damper buoyancy and normal-aligned orientation.
- Simple boat hull with four corner sample points for pitch, roll, and height.
- Debug UI: enable/disable bodies, stiffness, damping, drag, orientation blend, reset buttons.

Deferred to later milestones:

- Shoreline foam and object wake foam.
- Advanced hull shapes, drag models, and rigid-body coupling.
- Full water shading with reflection/refraction/absorption (Milestone 7).
