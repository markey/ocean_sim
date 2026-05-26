import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three/webgpu';

export type HeroBoatVisualOptions = {
  length: number;
  width: number;
  draft: number;
  hullColor?: number;
  cabinColor?: number;
  accentColor?: number;
};

const modelBounds = new THREE.Box3();
const modelSize = new THREE.Vector3();

/** CC0 Kenney "Sail Boat" from the Watercraft Kit (https://kenney.nl/assets/watercraft-kit). */
const HERO_BOAT_MODEL_URL = '/models/hero-boat.glb';

/**
 * Load and fit the hero boat GLB to the buoyancy hull dimensions.
 * Visual mesh only — sample points live on y = 0 in {@link FloatingBoat}.
 */
export async function loadHeroBoatVisual(options: HeroBoatVisualOptions): Promise<THREE.Group> {
  const { length, width, draft } = options;

  const gltf = await new GLTFLoader().loadAsync(HERO_BOAT_MODEL_URL);
  const model = gltf.scene;
  model.name = 'Hero Boat Model';

  // Kenney export faces +Z; FloatingBoat uses +X as bow.
  model.rotation.y = -Math.PI / 2;

  modelBounds.setFromObject(model);
  modelBounds.getSize(modelSize);
  const lengthScale = length / Math.max(modelSize.x, 1e-4);
  const widthScale = width / Math.max(modelSize.z, 1e-4);
  model.scale.setScalar(Math.min(lengthScale, widthScale * 1.08));

  modelBounds.setFromObject(model);
  const waterlineY = THREE.MathUtils.lerp(modelBounds.min.y, modelBounds.max.y, 0.34);
  model.position.y = -waterlineY - draft * 0.08;

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) {
        continue;
      }

      // Keep Kenney's wood/sail PBR colors; only soften specular response for the ocean lighting.
      material.roughness = Math.min(material.roughness + 0.08, 1);
      material.metalness = Math.min(material.metalness, 0.15);
    }
  });

  const group = new THREE.Group();
  group.name = 'Hero Boat Visual';
  group.add(model);
  return group;
}
