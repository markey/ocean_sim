# Spectral Ocean Simulation

Milestone 4 adds a three-cascade spectral ocean: large swells, mid-scale sea waves, and fine ripples. Each cascade has its own length scale, amplitude, wind influence, and choppiness. The water mesh renders the combined displacement and normals. Milestone 3’s JONSWAP spectrum, presets, and debug texture views remain, with per-cascade inspection in the debug overlay.

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
- `src/ocean/simulation/OceanCascadeSystem` — three `OceanSimulation` instances (swell / mid / detail) merged in world space into combined output textures.
- `src/ocean/fft` — separable inverse FFT module for a future GPU-only path.
- `src/ocean/rendering` — water mesh displaced and shaded from combined cascade textures.
- `src/ocean/debug` — lil-gui controls (global + per-cascade) and a camera-attached texture preview.
- `src/demo` — WebGPU scene, orbit camera, stats panel.

## GPU Data Flow

1. Each cascade builds `h0(k)` from the shared spectrum model with band-specific amplitude, patch size, and wind coupling.
2. Per cascade, `H(k, t)` evolves and inverse FFT produces η, `Dx`, `Dz`.
3. `OceanCascadeSystem` tiles each band in world space (repeat wrapping), sums displacements, and rebuilds normals and Jacobian on the combined field.
4. The water material samples the merged textures; debug can show combined or individual cascade outputs.

Compute kernels for spectrum upload and evolution remain wired per cascade for a future GPU-only update path.

## Milestone 4 Scope

Implemented:

- Three cascades: swell (512 m tile), mid waves (220 m), ripples (41 m). Presets pick which bands are active (e.g. long swell enables swell; whitecaps enables ripples).
- Per-cascade: length scale, amplitude, wind influence, choppiness, height scale, tiny-wave damping, enable/disable.
- World-space merge with tiling; combined normals and Jacobian.
- Debug UI: cascade selector plus height / displacement / normal / Jacobian views.

Deferred to later milestones:

- Persistent foam accumulation and crest rendering (Milestone 5).
- Buoyancy sampling (Milestone 6).
- Full water shading with reflection/refraction/absorption (Milestone 7).
