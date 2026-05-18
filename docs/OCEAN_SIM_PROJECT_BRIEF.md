Project: Spectral Ocean Simulation in Three.js WebGPU

Goal:
Build a real-time physically motivated ocean simulation in Three.js using WebGPU. This must not be a fake noise shader, a purely procedural normal map, or a Gerstner-only wave surface. The core of the project should be a Tessendorf-style spectral ocean simulation: generate a wave spectrum in frequency space, evolve it over time, run inverse FFT passes on the GPU, and use the resulting displacement, normal, and foam-related fields to render an animated ocean surface.

The first milestone should prioritize a technically correct GPU FFT ocean over visual polish. Once the simulation works, build the visual rendering stack on top of it.

Technical direction:
Use TypeScript, Vite, and Three.js. Prefer Three.js WebGPU and TSL where practical. If a specific TSL API is unstable or too limiting, use WGSL shader functions or lower-level WebGPU integration where necessary, but keep the rendering app in Three.js.

The system should be modular. Avoid building a one-off demo where simulation, rendering, UI, and scene setup are tangled together.

Core architecture:
Create these main modules:

src/ocean/spectrum/
- Generate complex Gaussian noise.
- Implement a physically motivated wave spectrum.
- Start with a simple Phillips spectrum if needed, but structure the code so JONSWAP can be added cleanly.
- Parameters should include wind speed, wind direction, amplitude, gravity, fetch or peak enhancement, directional spreading, and damping of tiny waves.

src/ocean/fft/
- Implement GPU-based inverse FFT.
- Use ping-pong textures or buffers.
- Support at least 256x256 resolution initially.
- Structure it so 512x512 can be enabled later.
- Implement horizontal and vertical FFT passes.
- Keep this module independent from ocean rendering.

src/ocean/simulation/
- Build the initial spectrum h0(k).
- Evolve the spectrum over time using the deep-water dispersion relation.
- Generate height, horizontal displacement, slope, and Jacobian-related data.
- Produce GPU textures or buffers that the water material can consume.
- Add a clean update(time) API.

src/ocean/rendering/
- Render a water mesh displaced by the simulation outputs.
- Use the simulated vertical and horizontal displacement, not fake waves.
- Reconstruct normals from slope textures or generated normal data.
- Add a basic physically inspired water material:
  - Fresnel reflection
  - depth-based absorption
  - refraction placeholder
  - sky/environment reflection placeholder
  - foam shading placeholder
- Rendering can be simple in milestone 1, but the simulation data must drive the surface.

src/ocean/foam/
- Later milestone.
- Use Jacobian/compression of the horizontal displacement field to detect likely breaking waves.
- Foam should accumulate and decay over time instead of appearing as random white noise.
- Start with crest foam. Add shoreline and object wake foam later.

src/ocean/buoyancy/
- Later milestone.
- Add an API to sample the simulated ocean height and normal.
- First support a floating sphere.
- Then support a simple boat using multiple sample points for pitch and roll.

src/demo/
- Build a simple scene with sky, sun, camera controls, one ocean patch, and debug UI.
- Use lil-gui or an equivalent lightweight control panel.
- Include controls for wind speed, wind direction, amplitude, choppiness, time scale, foam threshold, and simulation resolution.
- Include performance stats.

Milestone 1: GPU FFT proof of life
Deliver a working browser demo where:
- A flat ocean mesh is displaced by a GPU-generated FFT height field.
- The wave field evolves over time from a real spectral simulation.
- The camera can orbit the scene.
- Debug controls can change at least amplitude, wind direction, wind speed, and time scale.
- Visuals can be minimal. Correct simulation structure matters more than beauty.

Milestone 2: Choppy displacement and normals
Add:
- Horizontal displacement in X and Z.
- Slope or normal textures.
- Choppiness parameter.
- Water surface shading using the simulated normals.
- The ocean should no longer look like a simple vertical height sheet.

Milestone 3: Better spectrum controls
Add:
- JONSWAP spectrum or a clean equivalent physically motivated spectrum.
- Directional spreading.
- Presets such as calm sea, windy sea, storm, long swell.
- A debug view to inspect height, displacement, normal, and foam/Jacobian textures.

Milestone 4: Cascades
Add multiple simulation cascades:
- Large scale swells.
- Mid scale waves.
- Small scale ripples.
Each cascade should have its own length scale, resolution, amplitude, wind influence, and choppiness. Combine them in rendering.

Milestone 5: Foam
Add physically motivated foam:
- Detect compression or breaking potential using the Jacobian of the displacement field.
- Accumulate foam into a persistent foam texture.
- Add decay over time.
- Render foam at crests.
- Later add shoreline foam and wake foam from objects.

Milestone 6: Buoyancy
Add floating objects:
- Start with one sphere.
- Sample the simulated water height and normal.
- Apply vertical motion and orientation.
- Then add a simple boat-like hull with multiple sampling points.

Milestone 7: Visual ocean rendering
Once the simulation is solid, improve the rendering:
- Fresnel reflection.
- Refraction.
- Depth-based water absorption.
- Subsurface scattering approximation.
- Sun glints and sparkle.
- Caustics on a simple seafloor.
- Underwater mode with fog, color attenuation, particles, and surface distortion.

Constraints:
- Do not replace the simulation with procedural noise.
- Do not use Gerstner waves as the main solution.
- Do not hard-code everything into a single file.
- Do not optimize prematurely, but keep GPU resources explicit and organized.
- Prefer readable, well-documented code over clever shader tricks.
- Add comments explaining the math and the GPU data flow.
- Include a README explaining the simulation pipeline.

Initial implementation target:
Create the project scaffold and implement Milestone 1 first. Keep the first deliverable small and working:
- TypeScript + Vite + Three.js
- WebGPU renderer
- 256x256 spectral ocean simulation
- GPU inverse FFT pipeline
- Water mesh displaced by the generated height field
- Orbit camera
- Debug controls
- README with architecture notes and next steps

Important:
Before coding, inspect the currently installed Three.js WebGPU and TSL APIs and adapt the implementation to the actual version. If an API is experimental or has changed, document the decision and choose the most stable path that still keeps the simulation GPU-driven.