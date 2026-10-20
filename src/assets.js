// Loads the exported .glb models and textures, then tunes their materials for real time.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODELS = ['tree_autumn', 'pine', 'tree_twisted', 'cabin', 'cottage', 'lamppost', 'grass'];
const TEXTURES = ['terrain_grass', 'terrain_floor', 'terrain_dirt', 'sky'];
const LANTERN_COLOR = 0xffb45a; // the ogre scene's lanterns are pure red; use one warm color for all

// Material names come straight from the .blend files.
const FOLIAGE = new Set(['tree leaves', 'Pine tree leaves', 'leaf']);
const GRASS = 'grass';
const GLOW = 'light';
const SMOKE = 'smoke';

export const windUniforms = { uTime: { value: 0 } };

export async function loadAssets(onProgress) {
  const base = import.meta.env.BASE_URL;
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(loaded / total);
  const draco = new DRACOLoader(manager); // its decoder files are bundled by Vite
  const gltfLoader = new GLTFLoader(manager).setDRACOLoader(draco);
  const textureLoader = new THREE.TextureLoader(manager);

  const [gltfs, textures] = await Promise.all([
    Promise.all(MODELS.map((name) => gltfLoader.loadAsync(`${base}models/${name}.glb`))),
    Promise.all(TEXTURES.map((name) => textureLoader.loadAsync(`${base}textures/${name}.webp`))),
  ]);
  draco.dispose();

  const glowMaterials = new Set();
  const models = Object.fromEntries(MODELS.map((name, i) => [name, prepareModel(gltfs[i].scene, glowMaterials)]));
  return { models, textures: Object.fromEntries(TEXTURES.map((name, i) => [name, textures[i]])), glowMaterials };
}

function prepareModel(root, glowMaterials) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const m = obj.material;
    // No environment map in the scene, so strongly metallic parts would render black.
    m.metalness = Math.min(m.metalness, 0.35);

    if (FOLIAGE.has(m.name)) {
      cutout(m);
      addWind(m, 0.09, 2.5, 8);
    } else if (m.name === GRASS) {
      cutout(m);
      addWind(m, 0.14, 0, 1, { keepBackNormals: true });
      obj.castShadow = false;
    } else if (m.name === SMOKE) {
      m.transparent = true;
      m.depthWrite = false;
      m.alphaTest = 0;
      m.side = THREE.DoubleSide;
      obj.castShadow = false;
    } else if (m.name === GLOW) {
      m.emissive.setHex(LANTERN_COLOR);
      glowMaterials.add(m);
      obj.castShadow = false;
    } else {
      m.transparent = false;
    }
  });
  return root;
}

function cutout(m) {
  m.transparent = false;
  m.depthWrite = true;
  m.alphaTest = 0.5;
  m.alphaToCoverage = true;
  m.side = THREE.DoubleSide;
}

// Sways vertices above `start` (object-space height), reaching `amplitude` at start + range.
// keepBackNormals: don't flip normals on back faces (grass normals all point up, like the ground).
function addWind(material, amplitude, start, range, { keepBackNormals = false } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    if (keepBackNormals) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''),
      );
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 wp = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          wp = modelMatrix * wp;
          float k = ${amplitude.toFixed(3)} * clamp( ( position.y - ${start.toFixed(2)} ) / ${range.toFixed(2)}, 0.0, 1.0 );
          float sway = sin( uTime * 1.6 + wp.x * 0.21 + wp.z * 0.17 ) + 0.45 * sin( uTime * 3.7 + wp.x * 0.9 + wp.z * 0.6 );
          transformed.x += sway * k;
          transformed.z += sway * k * 0.7;
        }`,
      );
  };
  material.customProgramCacheKey = () => `wind-${amplitude}-${start}-${range}-${keepBackNormals}`;
}
