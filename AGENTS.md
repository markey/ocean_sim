# Agent instructions

This project is a real-time spectral ocean simulation in Three.js WebGPU.

Read docs/OCEAN_SIM_PROJECT_BRIEF.md before making implementation decisions.

Work milestone by milestone. Do not try to implement the entire project at once.

For each coding task:
- First inspect the installed Three.js/WebGPU/TSL APIs.
- Prefer small, reviewable diffs.
- Keep simulation, rendering, FFT, spectrum, and demo code modular.
- Do not replace the spectral simulation with fake shader noise.
- Do not use Gerstner waves as the main solution.
- Add comments for GPU data flow and nontrivial math.
- Run available build/typecheck/test commands before finishing.
- Update README or docs when architecture changes.

Initial priority:
Implement Milestone 1 only:
- TypeScript + Vite + Three.js
- WebGPU renderer
- 256x256 spectral ocean simulation
- GPU inverse FFT pipeline
- Water mesh displaced by generated height field
- Orbit camera
- Debug controls