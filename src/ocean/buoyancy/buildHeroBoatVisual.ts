import * as THREE from 'three/webgpu';

export type HeroBoatVisualOptions = {
  length: number;
  width: number;
  draft: number;
  hullColor?: number;
  cabinColor?: number;
  accentColor?: number;
};

/**
 * Stylized low-poly fishing boat built from primitives for the Milestone 11 benchmark scene.
 * Visual mesh only — buoyancy sample points live on the hull waterline in {@link FloatingBoat}.
 */
export function buildHeroBoatVisual(options: HeroBoatVisualOptions): THREE.Group {
  const { length, width, draft } = options;
  const hullColor = options.hullColor ?? 0x2a8375;
  const cabinColor = options.cabinColor ?? 0xf2ece2;
  const accentColor = options.accentColor ?? 0xcf7348;

  const hullMaterial = new THREE.MeshStandardMaterial({
    color: hullColor,
    roughness: 0.62,
    metalness: 0.04,
  });
  const cabinMaterial = new THREE.MeshStandardMaterial({
    color: cabinColor,
    roughness: 0.58,
    metalness: 0.03,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.55,
    metalness: 0.02,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x232323,
    roughness: 0.75,
    metalness: 0.02,
  });

  const group = new THREE.Group();
  group.name = 'Hero Boat Visual';

  const hullBody = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.78, draft * 1.1, width * 0.88),
    hullMaterial,
  );
  hullBody.name = 'Hull Body';
  hullBody.position.set(-length * 0.04, -draft * 0.45, 0);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(width * 0.44, length * 0.28, 4), hullMaterial);
  bow.name = 'Bow';
  bow.rotation.z = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(length * 0.42, -draft * 0.35, 0);

  const stern = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.12, draft * 0.95, width * 0.82),
    hullMaterial,
  );
  stern.name = 'Stern';
  stern.position.set(-length * 0.44, -draft * 0.42, 0);

  const rubRail = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.72, 0.12, width * 0.94),
    trimMaterial,
  );
  rubRail.position.set(-length * 0.02, draft * 0.02, 0);

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.55, 0.22, width * 0.62),
    cabinMaterial,
  );
  deck.name = 'Deck';
  deck.position.set(-length * 0.08, draft * 0.08, 0);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.32, draft * 1.85, width * 0.48),
    cabinMaterial,
  );
  cabin.name = 'Cabin';
  cabin.position.set(-length * 0.12, draft * 0.95, 0);

  const cabinRoof = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.34, 0.18, width * 0.52),
    accentMaterial,
  );
  cabinRoof.name = 'Cabin Roof';
  cabinRoof.position.set(-length * 0.12, draft * 1.95, 0);

  const windowBand = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.05, draft * 0.55, width * 0.42),
    accentMaterial,
  );
  windowBand.position.set(length * 0.04, draft * 0.88, 0);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, length * 0.34, 8),
    trimMaterial,
  );
  mast.name = 'Mast';
  mast.position.set(length * 0.05, draft * 2.35, 0);

  group.add(hullBody, bow, stern, rubRail, deck, cabin, cabinRoof, windowBand, mast);
  return group;
}
