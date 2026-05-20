import * as THREE from 'three/webgpu';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DebugControls } from '../ocean/debug/DebugControls';
import { WaterMesh } from '../ocean/rendering/WaterMesh';
import { OceanSimulation, type OceanSimulationParameters } from '../ocean/simulation/OceanSimulation';
import { StatsPanel } from './StatsPanel';

const SIMULATION_RESOLUTION = 256;

function createDefaultParameters(): OceanSimulationParameters {
  return {
    resolution: SIMULATION_RESOLUTION,
    patchSize: 220,
    amplitude: 0.0014,
    windSpeed: 18,
    windDirection: 35,
    gravity: 9.81,
    smallWaveDamping: 0.02,
    seed: 1337,
    heightScale: 1,
    timeScale: 1,
    choppiness: 1.25,
  };
}

export async function startOceanDemo(root: HTMLDivElement): Promise<void> {
  root.replaceChildren();

  if (!WebGPU.isAvailable()) {
    root.appendChild(WebGPU.getErrorMessage());
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ab7c9);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(120, 90, 140);

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  root.appendChild(renderer.domElement);

  await renderer.init();

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 40;
  controls.maxDistance = 500;

  const sun = new THREE.DirectionalLight(0xffffff, 3.2);
  sun.position.set(80, 120, 40);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xb9e7ff, 0x1f3b43, 1.2));
  scene.add(new THREE.GridHelper(220, 16, 0x5f7d88, 0x42616c).translateY(-0.05));

  const parameters = createDefaultParameters();
  const simulation = new OceanSimulation({
    ...parameters,
    windDirection: (parameters.windDirection * Math.PI) / 180,
  });
  const water = new WaterMesh(simulation);
  scene.add(water.mesh);

  await simulation.init(renderer);
  await renderer.compileAsync(scene, camera);

  const debugControls = new DebugControls(parameters, simulation, water);
  const stats = new StatsPanel();
  root.appendChild(stats.element);

  const clock = new THREE.Clock();
  let framePending = false;

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  window.addEventListener('resize', resize);

  renderer.setAnimationLoop(() => {
    if (framePending) {
      return;
    }

    framePending = true;
    const deltaSeconds = Math.min(clock.getDelta(), 1 / 20);

    void (async () => {
      try {
        await simulation.update(renderer, deltaSeconds);
        await water.update(renderer);
        controls.update();
        stats.update(deltaSeconds);
        renderer.render(scene, camera);
      } finally {
        framePending = false;
      }
    })();
  });

  window.addEventListener('beforeunload', () => {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    controls.dispose();
    debugControls.dispose();
    water.dispose();
    simulation.dispose();
    renderer.dispose();
  });
}
