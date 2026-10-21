import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// o Vite serve public/ na raiz do site; sem ele (Live Server, GitHub Pages) a pasta fica como esta no disco
const BASE = import.meta.env?.BASE_URL ?? './public/';

const FOREST_MODELS = ['tree_autumn', 'pine', 'tree_twisted', 'cabin', 'cottage', 'lamppost', 'grass'];
const FOREST_TEXTURES = ['terrain_grass', 'terrain_floor', 'terrain_dirt', 'sky'];

// Carrega tudo de uma vez: o ogro, a cena da casinha (fase 1) e a floresta (fases 2 e 3).
export async function loadAssets(onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(loaded / total);
  const draco = new DRACOLoader(manager); // acha o decodificador ao lado dele (node_modules pelo Vite, ou a CDN)
  const gltf = new GLTFLoader(manager).setDRACOLoader(draco);
  const tex = new THREE.TextureLoader(manager);

  const file = (path, as) => {
    const url = BASE + path;
    manager.itemStart(url);
    return fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${path}: ${r.status}`);
        return r[as]();
      })
      .finally(() => manager.itemEnd(url));
  };

  const [ogre, scene, level, instances, grass, ground, mask, models, textures] = await Promise.all([
    gltf.loadAsync(BASE + 'ogre/ogre.glb'),
    gltf.loadAsync(BASE + 'ogre/scene.glb'),
    file('ogre/level.json', 'json'),
    file('ogre/instances.bin', 'arrayBuffer').then((b) => new Float32Array(b)),
    tex.loadAsync(BASE + 'ogre/textures/grass.webp'),
    tex.loadAsync(BASE + 'ogre/textures/ground.webp'),
    tex.loadAsync(BASE + 'ogre/textures/mask.webp'),
    Promise.all(FOREST_MODELS.map((n) => gltf.loadAsync(`${BASE}models/${n}.glb`))),
    Promise.all(FOREST_TEXTURES.map((n) => tex.loadAsync(`${BASE}textures/${n}.webp`))),
  ]);
  draco.dispose();

  // mesma convencao do glTF (flipY = false) para bater com as UVs exportadas
  for (const t of [grass, ground, mask]) {
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
  }
  for (const t of [grass, ground]) t.wrapS = t.wrapT = THREE.RepeatWrapping;

  return {
    ogre,
    night: { scene, level, instances, textures: { grass, ground, mask } },
    forest: {
      models: Object.fromEntries(FOREST_MODELS.map((n, i) => [n, models[i].scene])),
      textures: Object.fromEntries(FOREST_TEXTURES.map((n, i) => [n, textures[i]])),
    },
  };
}

// nomes de nos passam por PropertyBinding.sanitizeNodeName no GLTFLoader
export const nodeName = (n) => n.replace(/\s/g, '_').replace(/[[\].:/]/g, '');
