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
- Presets such as glassy morning, calm sea, long/heavy swell, windy sea, choppy lagoon, open ocean, whitecaps, gale, and storm (with optional swell/ripple cascades per preset).
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

Milestone 8: Benchmark scene and lighting pass
Use the Water Pro screenshot as a visual direction, but keep this milestone focused on achievable presentation improvements. The goal is to make the existing spectral ocean feel less like a technical test scene and more like a composed sea view.

Add:
- A benchmark camera preset near the waterline with a repeatable "cinematic ocean" sea state for before/after screenshots.
- A stronger sky/sun setup: sun direction controls, warmer sun color, cooler sky color, horizon haze, tone mapping/exposure controls, and a visible sun disk or glow.
- Simple distance cues: a few low-poly island or rock silhouettes, a buoy or simple boat prop, and fog that softens the horizon.
- Better scene composition defaults: waterline camera height, sun glint angle, object placement, and GUI preset for the benchmark view.
- Documentation with the screenshot comparison goal and clear notes about which Water Pro qualities this milestone is targeting.

Acceptance criteria:
- The benchmark preset should immediately look more atmospheric than Milestone 7 without changing the spectral wave simulation.
- The scene should provide scale, horizon depth, and lighting variation when viewed from the saved camera.
- README or running/testing docs should explain how to open the benchmark view and capture a comparison screenshot.

Milestone 9: Surface material and foam polish
Improve the water surface shading using the existing simulation outputs. This milestone should avoid expensive full-scene reflection/refraction systems unless the installed Three.js WebGPU APIs make a small implementation practical.

Add:
- Stronger Fresnel and sky-color reflection approximation driven by view angle and simulated normals.
- Tunable sun glitter using the existing slope/normal data, with controls for intensity, sharpness, and threshold.
- Better water color controls for shallow/deep tint, absorption strength, subsurface color, and foam blending.
- Foam polish using the existing foam/Jacobian pipeline: sharper crest masks, less flat-white shading, lighting-aware foam color, and better decay/threshold defaults.
- Optional close-view normal refinement from existing cascade data if it can be done without adding procedural wave motion.
- Debug controls grouped into a "Surface polish" folder.

Acceptance criteria:
- The benchmark scene should show clearer highlights, richer water color, and more convincing crest foam than Milestone 8.
- The added sparkle and normal detail must be derived from spectral/cascade outputs, not from decorative scrolling normal maps as the primary surface detail.
- The app should remain interactive on a modern WebGPU browser at the current default resolution.

Milestone 10: Underwater polish and quality presets
Polish the already-planned underwater and presentation features, but keep the scope practical. This milestone is about making the demo easier to tune, compare, and run on different machines.

Add:
- A smoother waterline transition when the camera crosses the surface, using the existing underwater fog, color attenuation, and surface distortion effects.
- Improved underwater mood: denser depth fog, subtle particles, caustic strength controls, and better color attenuation defaults.
- Low/Medium/High quality presets for existing features such as simulation resolution, cascades, foam, environment effects, and post-processing toggles.
- A compact debug/performance panel showing FPS and the active quality preset. Add GPU timings only if they are straightforward with the current WebGPU/Three.js APIs.
- Fixed camera bookmarks and deterministic preset values for visual regression screenshots.
- Documentation for quality presets, benchmark screenshots, and remaining known visual gaps.

Acceptance criteria:
- The demo should have a practical High preset and a faster fallback preset.
- Underwater mode should feel intentional rather than like a color overlay.
- The benchmark workflow should make it easy to compare Milestone 8, 9, and 10 screenshots.

## Water Pro visual target (post–Milestone 10)

The reference screenshot `docs/water_pro.jpg` (Three.js Water Pro, Sea of Thieves preset) is the visual direction for the next polish pass. Milestones 8–10 already cover benchmark scene setup, surface polish, and quality presets. The remaining gap is mostly composition, atmosphere, and tuning of existing simulation-driven shading — not replacing the spectral pipeline.

### Achievable without major performance cost

These use existing cascade, foam, and environment data, or cheap visual-only additions:

- Benchmark composition: hero boat, buoy, better island silhouettes, tuned waterline camera
- Sky mood: procedural cloud bands, soft sun halo, warmer grading, stronger horizon haze
- Water material tuning: richer teal palette, crest subsurface scatter, translucency, analytic sky-dome reflections
- Sun glitter: broader highlights driven by simulated normals/slopes and cascade detail
- Crest foam polish: sharper Jacobian/accumulated foam masks, better lighting response
- Contact foam: cheap proximity-based foam rings around boat hull and buoy
- Sea-state tuning: choppiness, cascade mix, and foam thresholds for the benchmark open-ocean preset
- Optional lightweight bloom on sun disk and glitter (single pass or shader fake, only if WebGPU cost stays modest)

### Explicitly out of scope for these milestones

Avoid features that require raytracing, full-scene render targets, or heavy post stacks:

- Hardware or software raytracing
- Per-frame scene reflection/refraction render targets or screen-space reflections
- Volumetric god rays or multi-pass volumetric fog
- Decorative scrolling normal maps as the primary wave detail
- Runtime FFT resolution changes or GPU FFT migration (separate performance milestone later)
- Shoreline foam, object wake simulation, and full underwater polish beyond what Milestone 10 already provides

Performance guardrail: each milestone below should keep the **High** quality preset interactive on a modern WebGPU laptop/desktop at the current default simulation resolution (roughly 40+ FPS target).

Milestone 11: Benchmark props and composition
Replace placeholder debug geometry with a composed benchmark scene inspired by the Water Pro screenshot. No simulation changes.

Add:
- A stylized low-poly hero boat mesh as the focal prop (replacing or upgrading the current box hull)
- A simple buoy prop for scale (replacing the debug sphere where appropriate)
- Improved horizon silhouettes: rocky islands with optional low-poly palm or tree cues
- Retuned benchmark camera height, look target, sun glint angle, and prop placement to match the reference framing
- Optional GUI hide toggle or screenshot mode for clean benchmark captures
- Updated benchmark preset values and documentation for the new layout

Acceptance criteria:
- The benchmark view reads as a composed sea scene rather than a debug test layout
- Boat and buoy sit convincingly at the waterline using the existing buoyancy system
- README or running/testing docs describe the updated benchmark layout and screenshot workflow

Milestone 12: Sky, sun, and atmosphere
Improve mood and depth using the existing sky dome and fog — no volumetrics or raytracing.

Add:
- Procedural wispy cloud bands on the sky dome shader
- Soft sun halo or disk glow (shader-based; optional lightweight bloom only if cost stays low)
- Warmer sun color, cooler zenith sky, and stronger horizon haze defaults for the benchmark preset
- Slightly improved fog/background integration so distant islands soften naturally
- Debug controls grouped into a "Sky & atmosphere" folder (or extend the existing Rendering folder)

Acceptance criteria:
- The benchmark scene feels brighter and more atmospheric than Milestone 10
- Sky reads closer to the Water Pro reference (clouds, warm haze, visible sun) without new render passes per object
- High preset FPS remains within the performance guardrail

Milestone 13: Water color, glitter, and reflections
Polish the existing TSL water material using simulation outputs and analytic environment sampling only.

Add:
- Richer shallow/deep water palette with stronger crest subsurface scatter and slight crest translucency
- Sun glitter driven primarily by simulated normals, slopes, and cascade detail — reduce reliance on decorative procedural facet noise
- Improved Fresnel response and analytic sky-dome reflection sampling (direction-based sky color, not a scene render target)
- Benchmark open-ocean sea-state tuning: choppiness, cascade amplitudes, and foam deposit thresholds for a windier, more lively surface
- Debug controls for the new defaults in Surface polish / Rendering folders

Acceptance criteria:
- Water reads more vibrant and less flat/plastic at the benchmark camera than Milestone 10
- Highlights and crest color come from spectral/cascade data, not fake wave textures
- No new reflection/refraction render targets are introduced
- High preset FPS remains within the performance guardrail

Milestone 14: Foam polish and object contact effects
Improve foam appearance and add cheap object interaction using the existing foam/Jacobian pipeline.

Add:
- Sharper crest foam masks, better foam contrast defaults, and lighting-aware foam color tuning
- Contact foam rings around the boat hull and buoy using world-space proximity to object bounds (no fluid simulation)
- Reduced visible tiling in foam and displacement at the benchmark camera distance (UV/world-scale tuning)
- Optional simple wake-foam streak behind the moving boat via localized foam deposit or a cheap trailing mask
- Benchmark preset foam defaults tuned so whitecaps are clearly visible at the reference wind speed

Acceptance criteria:
- Crest foam is clearly visible and less flat-white at the benchmark sea state
- Contact foam appears where objects meet the water
- Foam still originates from Jacobian/accumulation or explicit contact masks — not random noise
- High preset FPS remains within the performance guardrail

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
