// Tunes the exported forest models' materials for real time (cutout foliage, wind, glowing lanterns).
import * as THREE from 'three';

const LANTERN_COLOR = 0xffb45a; // the ogre scene's lanterns are pure red; use one warm color for all

// Material names come straight from the .blend files.
export const FOLIAGE = new Set(['tree leaves', 'Pine tree leaves', 'leaf']);
const GRASS = 'grass';
const GLOW = 'light';
const SMOKE = 'smoke';

export const windUniforms = { uTime: { value: 0 } };

// Returns the glowing lantern materials (their brightness follows day and night).
export function prepareModels(models) {
  const glowMaterials = new Set();
  for (const root of Object.values(models)) prepareModel(root, glowMaterials);
  return glowMaterials;
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
