// Procedural heightfield terrain, flattened at clearings, with a dirt mask for paths.
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import {
  CLEARINGS, PLAY_RADIUS, WORLD_SIZE, clearingDistance, lerp, mulberry32, pathDistance, smoothstep,
} from './layout.js';

export const noise = new SimplexNoise({ random: mulberry32(1337) });

function fbm(x, z, octaves) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise.noise(x * freq, z * freq);
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum;
}

function baseHeight(x, z) {
  const hills = fbm(x / 110, z / 110, 4) * 14;
  // A ridge past the play area closes the world off.
  const ridge = smoothstep(PLAY_RADIUS - 5, PLAY_RADIUS + 60, Math.hypot(x, z)) * 30;
  return hills + ridge;
}

for (const c of Object.values(CLEARINGS)) c.y = baseHeight(c.x, c.z);

export function heightAt(x, z) {
  let h = baseHeight(x, z);
  for (const c of Object.values(CLEARINGS)) {
    h = lerp(h, c.y, smoothstep(c.r + 14, c.r * 0.5, Math.hypot(x - c.x, z - c.z)));
  }
  return h - (1 - smoothstep(0.5, 3, pathDistance(x, z))) * 0.12;
}

// 0 = grass, 1 = bare dirt (paths and the middle of clearings), with a ragged edge.
export function dirtAt(x, z) {
  const n = noise.noise(x / 6, z / 6) * 0.5 + noise.noise(x / 2.3, z / 2.3) * 0.25;
  let d = 1 - smoothstep(0.7, 2.2, pathDistance(x, z) + n * 1.2);
  for (const c of Object.values(CLEARINGS)) {
    if (!c.dirt) continue;
    const dc = Math.hypot(x - c.x, z - c.z);
    d = Math.max(d, 1 - smoothstep(c.dirt * 0.6, c.dirt, dc + n * 2.5));
  }
  return d;
}

// 0 = meadow grass (clearings, path sides), 1 = darker forest floor under the trees.
export function forestFloorAt(x, z) {
  const open = Math.min(smoothstep(3, 14, clearingDistance(x, z)), smoothstep(2.5, 8, pathDistance(x, z)));
  return open * (0.55 + 0.45 * noise.noise(x / 25, z / 25));
}

export function createTerrain({ grass, floor, dirt }, anisotropy) {
  for (const tex of [grass, floor, dirt]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
  }
  // The floor painting isn't seamless; mirroring hides its tile edges.
  floor.wrapS = floor.wrapT = THREE.MirroredRepeatWrapping;

  const segments = 256;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const ground = new Float32Array(pos.count * 2);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    uv.setXY(i, x / 7, z / 7);
    ground[i * 2] = forestFloorAt(x, z);
    ground[i * 2 + 1] = dirtAt(x, z);
    // Large-scale tint so the tiled texture doesn't look uniform.
    const tint = 0.84 + 0.16 * noise.noise(x / 35, z / 35) + 0.07 * noise.noise(x / 9, z / 9);
    const warm = 0.06 * noise.noise(x / 60 + 7, z / 60);
    colors[i * 3] = tint * (1 + warm);
    colors[i * 3 + 1] = tint;
    colors[i * 3 + 2] = tint * (0.96 - warm);
  }
  geo.setAttribute('ground', new THREE.BufferAttribute(ground, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const material = new THREE.MeshLambertMaterial({ map: grass, vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.floorMap = { value: floor };
    shader.uniforms.dirtMap = { value: dirt };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 ground;\nvarying vec2 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = ground;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D floorMap;\nuniform sampler2D dirtMap;\nvarying vec2 vGround;',
      )
      .replace(
        '#include <map_fragment>',
        `const vec3 LUMA = vec3( 0.3, 0.59, 0.11 );
        // The ogre scene's grass and dirt are very saturated: pull them toward House.blend's warmer palette.
        vec3 grassColor = texture2D( map, vMapUv ).rgb;
        grassColor = mix( vec3( dot( grassColor, LUMA ) ), grassColor, 0.75 ) * vec3( 1.08, 0.97, 0.72 );
        vec3 dirtColor = texture2D( dirtMap, vMapUv * 1.6 ).rgb;
        dirtColor = mix( vec3( dot( dirtColor, LUMA ) ), dirtColor, 0.55 ) * vec3( 1.0, 0.9, 0.8 );
        vec3 groundColor = mix( grassColor, texture2D( floorMap, vMapUv * 0.22 ).rgb, smoothstep( 0.2, 0.8, vGround.x ) );
        groundColor = mix( groundColor, dirtColor, smoothstep( 0.3, 0.7, vGround.y ) );
        diffuseColor.rgb *= groundColor;`,
      );
  };

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}
