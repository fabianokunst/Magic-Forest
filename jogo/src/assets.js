import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// o Vite serve public/ na raiz do site; sem ele (Live Server, GitHub Pages) a pasta fica como esta no disco
const BASE = (import.meta.env?.BASE_URL ?? './public/') + 'assets/';

export async function loadAssets(onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(loaded / total);

  const gltf = new GLTFLoader(manager);
  const tex = new THREE.TextureLoader(manager);

  const json = (p) => fetch(BASE + p).then((r) => r.json());
  const bin = (p) => fetch(BASE + p).then((r) => r.arrayBuffer()).then((b) => new Float32Array(b));

  const [scene, ogre, level, instances, grass, ground, mask] = await Promise.all([
    gltf.loadAsync(BASE + 'scene.glb'),
    gltf.loadAsync(BASE + 'ogre.glb'),
    json('level.json'),
    bin('instances.bin'),
    tex.loadAsync(BASE + 'textures/grass.webp'),
    tex.loadAsync(BASE + 'textures/ground.webp'),
    tex.loadAsync(BASE + 'textures/mask.webp'),
  ]);

  // mesma convencao do glTF (flipY = false) para bater com as UVs exportadas
  for (const t of [grass, ground, mask]) {
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
  }
  for (const t of [grass, ground]) t.wrapS = t.wrapT = THREE.RepeatWrapping;

  return { scene, ogre, level, instances, textures: { grass, ground, mask } };
}

// nomes de nos passam por PropertyBinding.sanitizeNodeName no GLTFLoader
export const nodeName = (n) => n.replace(/\s/g, '_').replace(/[[\].:/]/g, '');
