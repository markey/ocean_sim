import * as THREE from 'three/webgpu';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FloatingBoat, FloatingSphere } from '../ocean/buoyancy';
import { DebugControls } from '../ocean/debug/DebugControls';
import { DebugTextureView } from '../ocean/debug/DebugTextureView';
import { OceanEnvironment } from '../ocean/rendering/OceanEnvironment';
import { WaterMesh } from '../ocean/rendering/WaterMesh';
import { createDefaultCascadeSystemParameters } from '../ocean/simulation/cascadeConfig';
import { OceanCascadeSystem } from '../ocean/simulation/OceanCascadeSystem';
import { StatsPanel } from './StatsPanel';

export async function startOceanDemo(root: HTMLDivElement): Promise<void> {
  root.replaceChildren();

  if (!WebGPU.isAvailable()) {
    root.appendChild(WebGPU.getErrorMessage());
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ab7c9);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(58, 12, 92);

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  let pixelRatioCap = 2;
  root.appendChild(renderer.domElement);

  await renderer.init();

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(-28, 4.5, -56);
  controls.maxPolarAngle = Math.PI * 0.72;
  controls.minDistance = 12;
  controls.maxDistance = 280;

  const sun = new THREE.DirectionalLight(0xfff0d0, 3.15);
  sun.position.set(-98, 60, -104);
  scene.add(sun);
  const hemisphere = new THREE.HemisphereLight(0x8fb7e8, 0x18343b, 0.68);
  scene.add(hemisphere);

  const parameters = createDefaultCascadeSystemParameters();
  const cascadeSystem = new OceanCascadeSystem(parameters);
  const water = new WaterMesh(cascadeSystem.getCombinedSurface());
  const oceanEnvironment = new OceanEnvironment(scene, { sun, hemisphere });
  const debugTextureView = new DebugTextureView(cascadeSystem);
  const floatingSphere = new FloatingSphere();
  const floatingBoat = new FloatingBoat();
  scene.add(water.mesh);
  scene.add(debugTextureView.mesh);
  scene.add(floatingSphere.mesh);
  scene.add(floatingBoat.group);

  await cascadeSystem.init(renderer);
  water.update(renderer, cascadeSystem.getCombinedSurface());
  await renderer.compileAsync(scene, camera);
  const stats = new StatsPanel();
  root.appendChild(stats.element);

  const setRendererPixelRatioCap = (nextPixelRatioCap: number) => {
    pixelRatioCap = nextPixelRatioCap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  const applyBenchmarkView = () => {
    camera.position.set(58, 12, 92);
    controls.target.set(-28, 4.5, -56);
    controls.update();
  };
  const applyUnderwaterView = () => {
    camera.position.set(22, -10, 34);
    controls.target.set(-12, -5, -34);
    controls.update();
  };
  const applyOverview = () => {
    camera.position.set(18, 72, 94);
    controls.target.set(-18, 1.5, -20);
    controls.update();
  };

  const debugControls = new DebugControls(
    parameters,
    cascadeSystem,
    water,
    debugTextureView,
    { sphere: floatingSphere, boat: floatingBoat },
    oceanEnvironment,
    {
      applyBenchmarkView,
      applyUnderwaterView,
      applyOverview,
      setExposure: (exposure: number) => {
        renderer.toneMappingExposure = exposure;
      },
      setPixelRatioCap: setRendererPixelRatioCap,
      setQualityPresetLabel: (label: string) => {
        stats.setQualityPreset(label);
      },
    },
  );
  applyBenchmarkView();
  water.update(renderer, cascadeSystem.getCombinedSurface());

  const clock = new THREE.Clock();

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
    renderer.setSize(width, height);
  };

  window.addEventListener('resize', resize);

  renderer.setAnimationLoop(() => {
    const deltaSeconds = Math.min(clock.getDelta(), 1 / 30);

    cascadeSystem.update(renderer, deltaSeconds);
    const surface = cascadeSystem.getCombinedSurface();
    water.update(renderer, surface);
    const elapsedSeconds = clock.elapsedTime;
    oceanEnvironment.update(camera, elapsedSeconds);
    water.updateRendering(elapsedSeconds, oceanEnvironment.getSunDirection());
    floatingSphere.update(deltaSeconds, surface);
    floatingBoat.update(deltaSeconds, surface);
    controls.update();
    debugTextureView.updateLayout(camera, window.innerWidth, window.innerHeight);
    stats.update(deltaSeconds);
    renderer.render(scene, camera);
  });

  window.addEventListener('beforeunload', () => {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    controls.dispose();
    debugControls.dispose();
    debugTextureView.dispose();
    floatingSphere.dispose();
    floatingBoat.dispose();
    oceanEnvironment.dispose();
    water.dispose();
    cascadeSystem.dispose();
    renderer.dispose();
  });
}
