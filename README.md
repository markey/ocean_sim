# Spectral Ocean Simulation

Milestone 2 extends the Tessendorf-style spectral ocean with horizontal choppy displacement, simulated surface normals, and basic normal-driven water shading. The demo generates an initial Phillips wave spectrum, evolves it over time, runs inverse FFT passes, and displaces a water mesh from the resulting height and horizontal displacement fields.

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
- `src/ocean/simulation` owns the update API and produces GPU-friendly `DataTexture`s for displacement and normals each frame.
- `src/ocean/fft` implements the separable inverse FFT for future GPU-side use. Milestone 2 still evaluates the surface fields on the CPU while keeping the GPU FFT module in place.
- `src/ocean/rendering` builds the water mesh and node material. Milestone 2 displaces vertices in X, Y, and Z from the simulated displacement texture and shades the surface with the simulated normal texture.
- `src/demo` contains scene setup, WebGPU capability handling, orbit controls, debug GUI, and a small FPS panel.

## GPU Data Flow

1. CPU creates `h0(k)` and conjugate `h0(-k)` data in a float buffer.
2. Each frame, the evolved complex height spectrum `H(k, t)` is evaluated with the deep-water dispersion relation.
3. Separate inverse FFT passes produce spatial height `η`, horizontal displacement `Dx`, and `Dz`. The choppiness parameter scales the horizontal displacement spectrum as in Tessendorf's `-i * k/|k| * H(k)`.
4. A normal texture is derived from the displaced surface using periodic central differences across the tile.
5. The water material samples the displacement texture for vertex offset and the normal texture for lighting and a simple Fresnel tint.

The compute kernels for spectrum upload, evolution, and height extraction remain available for a future GPU-only update path.

## Milestone 2 Scope

Implemented:

- Horizontal choppy displacement in X and Z with a debug choppiness control.
- Simulated slope/normal texture derived from the displaced surface.
- Water mesh displaced in all three axes instead of vertical-only height.
- Basic normal-driven shading with a simple Fresnel sky tint.

Deferred to later milestones:

- Jacobian and foam accumulation.
- Multi-cascade spectrum.
- JONSWAP spectrum and directional spreading presets.
- Buoyancy sampling.
- Full water shading with reflection/refraction/absorption.
