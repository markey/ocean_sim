import * as THREE from 'three/webgpu';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FloatingBoat, FloatingSphere } from '../ocean/buoyancy';
import { DebugControls } from '../ocean/debug/DebugControls';
import { DebugTextureView } from '../ocean/debug/DebugTextureView';
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
  camera.position.set(42, 22, 48);

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
  controls.target.set(2, 4, 0);
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 12;
  controls.maxDistance = 280;

  const sun = new THREE.DirectionalLight(0xffffff, 3.2);
  sun.position.set(80, 120, 40);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xb9e7ff, 0x1f3b43, 1.2));

  const parameters = createDefaultCascadeSystemParameters();
  const cascadeSystem = new OceanCascadeSystem(parameters);
  const water = new WaterMesh(cascadeSystem.getCombinedSurface());
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

  const debugControls = new DebugControls(
    parameters,
    cascadeSystem,
    water,
    debugTextureView,
    { sphere: floatingSphere, boat: floatingBoat },
  );
  water.update(renderer, cascadeSystem.getCombinedSurface());
  const stats = new StatsPanel();
  root.appendChild(stats.element);

  const clock = new THREE.Clock();

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  window.addEventListener('resize', resize);

  renderer.setAnimationLoop(() => {
    const deltaSeconds = Math.min(clock.getDelta(), 1 / 30);

    cascadeSystem.update(renderer, deltaSeconds);
    const surface = cascadeSystem.getCombinedSurface();
    water.update(renderer, surface);
    floatingSphere.update(deltaSeconds, surface, water);
    floatingBoat.update(deltaSeconds, surface, water);
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
    water.dispose();
    cascadeSystem.dispose();
    renderer.dispose();
  });
}
