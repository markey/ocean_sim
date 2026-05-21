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
- The Milestone 11 benchmark view: low camera, hero boat, floating buoy, palm-topped horizon islands, sky/sun, and horizon haze
- The Milestone 9 surface polish controls for water color, reflection, glitter, and foam
- The Milestone 10 quality presets, camera bookmarks, and smoother underwater transition controls

The ocean should animate continuously. Waves evolve from the GPU spectral simulation and inverse FFT, not from procedural noise.

### Codex desktop note

When running this project from Codex automation on Windows, use the plain project command:

```bash
npm run dev
```

Do not wrap Vite in PowerShell `Start-Process` just to force a custom port. In this environment, `Start-Process` can return immediately without keeping the Vite child server alive, often with empty log files and no listening port. If a background launch is needed for browser testing, keep the same command (`npm run dev`) in a persistent shell/process and read the Vite URL from its output.

## Benchmark screenshot view

Milestone 11 composes a repeatable comparison view inspired by the Water Pro reference screenshot. In the **Benchmark scene** GUI folder:

- **Apply camera** restores the saved low waterline camera aimed at the hero boat.
- **Apply full preset** restores the open-ocean sea state, Milestone 11 lighting, haze, exposure, and saved camera.
- **Screenshot mode (H)** hides the debug panel and FPS overlay for clean captures.

Press **H** at any time to toggle screenshot mode on or off.

The default scene layout includes:

- A stylized **hero boat** near the center of the benchmark frame.
- A **floating buoy** in the mid-ground for scale.
- **Horizon islands** with low-poly palm silhouettes.

Use this view for before/after screenshots. The **Rendering** folder exposes sun azimuth, sun elevation, sun intensity, horizon haze, and exposure controls for small composition adjustments.

## Surface polish controls

Milestone 9 adds a **Surface polish** GUI folder for material tuning:

- **Foam blend**, **Foam contrast**, and **Foam light** tune the existing foam texture and Jacobian crest mask.
- **Deep color**, **Shallow color**, **Reflection color**, **Subsurface color**, and **Foam color** tune the water palette.
- **Sky reflection** and **Glitter sharpness** live in the **Rendering** folder with the other visual controls.

These controls adjust shading only. The ocean shape, normals, sparkle mask, and crest foam still come from the spectral cascade outputs, not from decorative scrolling normal maps.

## Quality presets and underwater view

Milestone 10 adds a **Quality** GUI folder:

- **Low** caps pixel ratio at `1`, disables swell/detail cascades, and lowers expensive visual effects.
- **Medium** caps pixel ratio at `1.5`, keeps detail ripples, and uses moderate visual effects.
- **High** caps pixel ratio at `2`, keeps swell/detail cascades, and restores the richest visual effects.

These presets tune the active renderer and existing cascades. They do not rebuild the FFT texture resolution at runtime yet.

The **Benchmark scene** folder also includes camera bookmarks:

- **Apply camera** restores the benchmark waterline view.
- **Underwater view** forces underwater mode and moves below the surface.
- **Overview camera** switches back above water.

The **Rendering** folder includes **Waterline blend**, which controls how gradually fog, background color, seafloor, and particles fade in as the camera crosses the surface.

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
| **Buoyancy** | Floating buoy and hero boat ride waves; toggle, tune stiffness/damping, reset positions in the Buoyancy folder |
| **Benchmark scene** | Restores the saved Milestone 8 camera and open-ocean lighting preset |
| **Sun / haze / exposure** | Tunes the Milestone 8 sky, sun disk, horizon haze, and renderer exposure |
| **Surface polish** | Tunes Milestone 9 water colors, sky reflection, glitter, and lighting-aware foam blend |
| **Quality** | Switches Low/Medium/High pixel ratio, cascade, foam, and environment settings |
| **Waterline blend** | Tunes the Milestone 10 transition distance between above-water and underwater atmosphere |

### Buoyancy (Milestone 6 / 11)

- [ ] **Floating buoy** bobs on the surface in the mid-ground
- [ ] **Hero boat** pitches and rolls with four corner height samples near the benchmark center
- [ ] Disabling **Buoy** or **Boat** in the Buoyancy folder stops that body’s motion
- [ ] **Reset buoy** / **Reset boat** return bodies to their benchmark spawn poses
- [ ] Higher **Vertical stiffness** reduces lag on wave crests; higher **Orientation blend** tracks slope faster

### Performance

- [ ] FPS panel shows a stable frame rate on your target hardware
- [ ] FPS panel shows the active quality preset
- [ ] Low/Medium/High presets visibly change performance/visual cost
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
