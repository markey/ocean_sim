# Running and Testing the Ocean Simulation

This guide explains how to run the spectral ocean demo locally and verify that the current milestone behaves as expected.

## Requirements

- **Node.js** 18 or newer (LTS recommended)
- **npm** (bundled with Node)
- A **WebGPU-capable browser**:
  - Chrome or Edge 113+ (recommended)
  - Firefox with WebGPU enabled (may require flags on some versions)

WebGPU is required. The demo does not fall back to WebGL. If WebGPU is unavailable, the page shows an error instead of rendering the ocean.

## First-time setup

From the repository root:

```bash
npm install
```

This installs Three.js, Vite, TypeScript, and lil-gui.

## Run the development server

```bash
npm run dev
```

Vite serves the app at **http://127.0.0.1:5173/** (port may differ if 5173 is in use; check the terminal output).

Open that URL in a WebGPU-capable browser. You should see:

- A displaced ocean mesh on a grid
- An orbit camera (drag to rotate, scroll to zoom)
- A **Spectral Ocean** debug panel (lil-gui)
- An **FPS** readout in the corner

The ocean should animate continuously. Waves evolve from the GPU spectral simulation and inverse FFT, not from procedural noise.

## Manual testing checklist

Use this checklist after changes to simulation, FFT, or rendering code.

### Startup

- [ ] Page loads without console errors
- [ ] No "Ocean demo failed to start" error screen
- [ ] WebGPU initializes successfully (no WebGPU unavailable message)

### Visual behavior

- [ ] Ocean surface displaces vertically over time
- [ ] Motion is smooth and continuous (not frozen or flickering)
- [ ] Grid helper and lighting are visible for depth reference
- [ ] Resizing the browser window updates the viewport without breaking the scene

### Camera controls

- [ ] Left-drag orbits the camera around the ocean
- [ ] Scroll wheel zooms in and out within the configured distance limits

### Debug controls (Spectral Ocean panel)

| Control | What to verify |
| --- | --- |
| **Sea state preset** | Switches spectrum parameters and regenerates waves |
| **Spectrum model** | Phillips vs JONSWAP changes wave energy distribution |
| **Amplitude** | Larger values produce taller waves (spectrum re-initializes on release) |
| **Wind speed** | Higher speed increases wave energy / roughness |
| **Wind direction** | Wave orientation shifts toward the new wind heading |
| **Fetch** | Longer fetch shifts energy toward longer waves (JONSWAP) |
| **Peak γ** | Higher values sharpen the spectral peak |
| **Spread s** | Higher values narrow waves along the wind direction |
| **Time scale** | `0` freezes motion; values above `1` speed up animation |
| **Height scale** | `1.0` = calibrated (~10 m peaks on windy sea). Range `0.5`–`2` = calmer to rougher. Scales height only, not chop. |
| **Amplitude** | Spectrum energy; also auto-scales wave height via calibration |
| **Choppiness** | Increases horizontal displacement and sharper crests |
| **Tiny-wave damping** | Higher values suppress small ripples |
| **Debug texture** | PiP overlay shows height, displacement, normal, Jacobian, or accumulated foam |
| **Foam** | Whitecaps build at crests where Jacobian compression exceeds threshold; decay and clear in the Foam folder |
| **Buoyancy** | Orange sphere and brown boat ride waves; toggle, tune stiffness/damping, reset positions in the Buoyancy folder |

### Buoyancy (Milestone 6)

- [ ] Orange **sphere** bobs on the surface near `(12, 8)` in world XZ
- [ ] **Boat** hull pitches and rolls with four corner height samples near `(-14, -10)`
- [ ] Disabling **Sphere** or **Boat** in the Buoyancy folder stops that body’s motion
- [ ] **Reset sphere** / **Reset boat** return bodies to their spawn poses
- [ ] Higher **Vertical stiffness** reduces lag on wave crests; higher **Orientation blend** tracks slope faster

### Performance

- [ ] FPS panel shows a stable frame rate on your target hardware
- [ ] Interaction with debug sliders remains responsive

## Automated checks

Run these from the repository root before opening a pull request or after significant edits:

```bash
npm run typecheck
```

Type-checks the TypeScript project without emitting files.

```bash
npm run build
```

Runs type-checking and produces an optimized production build in `dist/`.

There is no unit or E2E test suite yet. Type-check and build success, plus the manual checklist above, are the current acceptance gates.

## Production preview

To test the built output locally:

```bash
npm run build
npm run preview
```

Open the URL printed in the terminal (default **http://127.0.0.1:4173/**). Behavior should match the dev server.

## Troubleshooting

### WebGPU not available

- Update Chrome or Edge to a recent version
- On Windows, ensure GPU drivers are up to date
- Try `chrome://gpu` and confirm WebGPU is enabled
- Remote desktop or virtual machines sometimes block WebGPU access

### Blank or static ocean

- Open DevTools and check the console for shader or compute errors
- Confirm **Time scale** is greater than `0`
- Try increasing **Height scale** to make displacement easier to see

### Port already in use

Vite picks the next free port automatically. Use the URL shown in the terminal output.

### Changes not appearing

Hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) or restart `npm run dev`. Vite hot-reloads most source changes automatically.

## Related docs

- [README](../README.md) — project overview and architecture
- [OCEAN_SIM_PROJECT_BRIEF.md](./OCEAN_SIM_PROJECT_BRIEF.md) — milestones and design goals
