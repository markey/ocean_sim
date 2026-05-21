# Spectral Ocean Simulation

Milestone 10 adds underwater polish, camera bookmarks, and practical quality presets on top of the existing spectral simulation. Low/Medium/High presets tune pixel ratio, cascade enablement, foam, refraction, sparkle, caustics, and underwater particles; underwater mode now blends across the waterline instead of snapping atmosphere abruptly. Milestone 9 surface polish, Milestone 8 benchmark scene lighting, Milestone 7 water rendering, buoyancy, crest foam, cascades, JONSWAP presets, and debug texture views remain.

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
- `src/ocean/rendering` — water mesh displaced and shaded from combined cascade textures plus foam map; Milestone 10 waterline/underwater polish, Milestone 9 surface polish, and Milestone 8 benchmark sky/horizon environment.
- `src/ocean/debug` — lil-gui controls (global, per-cascade, foam, buoyancy) and a camera-attached texture preview.
- `src/demo` — WebGPU scene, orbit camera, stats panel, floating bodies.

## GPU Data Flow

1. Each cascade builds `h0(k)` from the shared spectrum model with band-specific amplitude, patch size, and wind coupling.
2. Per cascade, `H(k, t)` evolves and inverse FFT produces η, `Dx`, `Dz`.
3. `OceanCascadeSystem` tiles each band in world space, sums displacements, and rebuilds normals and Jacobian on the combined field.
4. `FoamAccumulator` reads combined Jacobian compression, deposits foam where `1 − J` exceeds a threshold, and decays stored foam each frame.
5. The water material samples merged displacement/normals, Jacobian, and foam textures, then layers Fresnel reflection, refracted viewport tint, absorption, subsurface scattering, slope-driven sun glitter, and lighting-aware foam.
6. `OceanSurfaceSampler` reads the same combined CPU displacement/normal textures for buoyancy at arbitrary world XZ points.
7. `OceanEnvironment` adds visual-only sky, sun, horizon silhouettes, seafloor caustics, underwater fog/particles, and a blended waterline atmosphere transition. These effects do not synthesize wave motion; the simulated spectral surface still drives the ocean shape.

Compute kernels for spectrum upload and evolution remain wired per cascade for a future GPU-only update path.

## Milestone 8 Benchmark

Use the **Benchmark scene** GUI folder to return to the saved Water Pro-style comparison view:

- **Apply camera** restores the low waterline camera.
- **Apply full preset** restores the open-ocean sea state, lighting, haze, exposure, and camera.
- The **Rendering** folder includes sun azimuth/elevation, sun intensity, horizon haze, and exposure controls.

The benchmark scene targets atmosphere, scale, and lighting composition only. It does not replace the FFT/cascade simulation with decorative waves.

## Milestone 9 Surface Polish

Use the **Surface polish** GUI folder to tune the water material:

- Foam blend, contrast, and lighting response.
- Deep/shallow water colors, reflection color, subsurface color, and foam color.
- The **Rendering** folder also exposes sky reflection strength and glitter sharpness.

Sparkle and foam remain tied to simulated normals, slopes, Jacobian compression, and accumulated foam textures. There are no scrolling normal maps or Gerstner waves standing in for the spectral surface.

## Milestone 10 Quality And Underwater

Use the **Quality** GUI folder to switch between **Low**, **Medium**, and **High**. These presets tune existing runtime features:

- Pixel ratio cap.
- Swell/detail cascade enablement.
- Foam blend, refraction, sparkle, caustics, and underwater particles.

Use the **Benchmark scene** folder for camera bookmarks:

- **Apply camera** restores the benchmark waterline shot.
- **Underwater view** forces underwater mode and moves the camera below the surface.
- **Overview camera** returns to an above-water inspection view.

The **Rendering** folder includes **Waterline blend** for tuning the smooth transition distance as the camera crosses the surface. The presets do not rebuild FFT resolution at runtime yet; that remains a future deeper performance milestone.

## Milestone 7 Scope

Implemented:

- `WaterMesh` visual controls for Fresnel, refraction, absorption, subsurface scattering, sparkle, and foam strength.
- `OceanEnvironment` seafloor caustics plus auto/forced underwater fog and particles.
- Debug UI rendering folder for tuning Milestone 7 effects at runtime.

Deferred to later milestones:

- Shoreline foam and object wake foam.
- True reflection/refraction render targets and scene-aware underwater post-processing.
- Advanced hull shapes, drag models, and rigid-body coupling.
