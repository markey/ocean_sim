import * as THREE from 'three/webgpu';

/** Shared zero foam map for cascade bands that do not run accumulation. */
let emptyFoamTexture: THREE.DataTexture | null = null;

export function getEmptyFoamTexture(): THREE.DataTexture {
  if (!emptyFoamTexture) {
    const data = new Uint8Array([0, 0, 0, 255]);
    emptyFoamTexture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    emptyFoamTexture.minFilter = THREE.NearestFilter;
    emptyFoamTexture.magFilter = THREE.NearestFilter;
    emptyFoamTexture.wrapS = THREE.RepeatWrapping;
    emptyFoamTexture.wrapT = THREE.RepeatWrapping;
    emptyFoamTexture.generateMipmaps = false;
    emptyFoamTexture.needsUpdate = true;
  }

  return emptyFoamTexture;
}
