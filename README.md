# Spectral Ocean Simulation

Milestone 3 adds a JONSWAP wave spectrum, configurable directional spreading, named sea-state presets, and a fullscreen debug view for simulation textures (height, displacement, normals, and Jacobian compression). Milestone 2’s choppy displacement and normal-driven shading remain in place.

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

- `src/ocean/spectrum` — Phillips and JONSWAP initial spectra, Donelan-style directional spreading (`cos^(2s)(θ/2)`), and named presets (calm sea, windy sea, storm, long swell).
- `src/ocean/simulation` — spectral time evolution, CPU inverse FFT, displacement/normal/Jacobian `DataTexture`s each frame.
- `src/ocean/fft` — separable inverse FFT module for a future GPU-only path.
- `src/ocean/rendering` — water mesh displaced and shaded from simulation textures.
- `src/ocean/debug` — lil-gui controls and a camera-attached texture preview overlay.
- `src/demo` — WebGPU scene, orbit camera, stats panel.

## GPU Data Flow

1. CPU builds `h0(k)` from the selected spectrum model (Phillips or JONSWAP) with directional spreading.
2. Each frame, `H(k, t)` is evolved with the deep-water dispersion relation.
3. Inverse FFT produces spatial height η and horizontal displacements `Dx`, `Dz` (choppiness scales the horizontal spectrum).
4. Normals are derived from the displaced surface; the Tessendorf Jacobian `J` flags compression for future foam.
5. The water material samples displacement and normals; the debug overlay can inspect any of the output textures.

Compute kernels for spectrum upload, evolution, and height extraction remain wired for a future GPU-only update path.

## Milestone 3 Scope

Implemented:

- JONSWAP spectrum with fetch-limited peak frequency and peak enhancement γ.
- Directional spreading parameter `s` (narrower seas at higher values).
- Presets: calm sea, windy sea, storm, long swell.
- Debug texture view: height, displacement, normal, Jacobian (compression / foam potential).
- Phillips spectrum retained and updated to use the same directional spreading model.

Deferred to later milestones:

- Persistent foam accumulation and crest rendering (Milestone 5).
- Multi-cascade spectrum (Milestone 4).
- Buoyancy sampling (Milestone 6).
- Full water shading with reflection/refraction/absorption (Milestone 7).
