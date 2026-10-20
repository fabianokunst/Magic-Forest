import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadAssets, windUniforms } from './assets.js';
import { Player } from './player.js';
import { CLEARINGS, mulberry32 } from './world/layout.js';
import { createTerrain, heightAt } from './world/terrain.js';
import { createSky } from './world/sky.js';
import { createForest, TREE_CHUNK } from './world/forest.js';
import { createGrass, GRASS_CHUNK } from './world/grass.js';
import { placeProps } from './world/props.js';
import { createFireflies } from './world/fireflies.js';
import { Atmosphere } from './world/atmosphere.js';
import { ChunkCuller } from './world/instancing.js';

// URL options: ?night  start at night | ?shot  hide the UI
// ?view=x,y,z,lookX,lookY,lookZ  camera | ?view=x,z,lookX,lookZ  camera at eye height
const params = new URLSearchParams(location.search);
const ui = {
  loading: document.getElementById('loading'),
  fill: document.getElementById('loading-fill'),
  text: document.getElementById('loading-text'),
  overlay: document.getElementById('overlay'),
  cta: document.querySelector('#overlay .cta'),
  hud: document.getElementById('hud'),
  mode: document.getElementById('hud-mode'),
  fps: document.getElementById('hud-fps'),
};

const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 600);

async function main() {
  const assets = await loadAssets((p) => (ui.fill.style.width = `${Math.round(p * 100)}%`));
  ui.text.textContent = 'Plantando a floresta…';
  await new Promise(requestAnimationFrame);

  const rand = mulberry32(2024);
  const terrain = createTerrain(
    { grass: assets.textures.terrain_grass, floor: assets.textures.terrain_floor, dirt: assets.textures.terrain_dirt },
    renderer.capabilities.getMaxAnisotropy(),
  );
  const sky = createSky(assets.textures.sky);
  const forest = createForest(assets.models, rand);
  const grass = createGrass(assets.models.grass, rand);
  const props = placeProps(assets.models);
  const fireflies = createFireflies(rand);
  scene.add(terrain, sky, props.group, fireflies, ...forest.chunks, ...grass);

  const culler = new ChunkCuller();
  culler.add(forest.chunks, 200, TREE_CHUNK);
  culler.add(grass, 65, GRASS_CHUNK);

  // HDR + MSAA render target so bloom catches lanterns and foliage edges stay smooth.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.6, 1);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const atmosphere = new Atmosphere({
    scene, renderer, sky, fireflies, bloom,
    glowMaterials: assets.glowMaterials,
    lamps: props.lamps,
    night: params.has('night'),
  });
  const player = new Player(camera, renderer.domElement, {
    heightAt,
    colliders: [...forest.colliders, ...props.colliders],
  });

  // Start on the path, looking at the cabin.
  const view = params.get('view')?.split(',').map(Number);
  if (view?.length === 6) {
    camera.position.set(view[0], view[1], view[2]);
    camera.lookAt(view[3], view[4], view[5]);
  } else if (view?.length === 4) {
    // x,z,lookX,lookZ at eye height above the ground
    camera.position.set(view[0], heightAt(view[0], view[1]) + 1.7, view[1]);
    camera.lookAt(view[2], heightAt(view[2], view[3]) + 3, view[3]);
  } else {
    camera.position.set(5, heightAt(5, 27) + 1.7, 27);
    camera.lookAt(CLEARINGS.cabin.x, CLEARINGS.cabin.y + 4, CLEARINGS.cabin.z);
  }

  const updateMode = () => {
    ui.mode.textContent = `${player.flying ? 'voo' : 'a pé'} · ${atmosphere.target > 0.5 ? 'noite' : 'dia'}`;
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyN') atmosphere.toggle();
    if (e.code === 'KeyF') player.toggleFly();
    updateMode();
  });
  ui.overlay.addEventListener('click', () => player.controls.lock());
  player.controls.addEventListener('lock', () => {
    ui.overlay.hidden = true;
    ui.hud.hidden = false;
  });
  player.controls.addEventListener('unlock', () => {
    ui.overlay.hidden = false;
    ui.cta.textContent = 'Clique para continuar';
  });

  const resize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(innerWidth, innerHeight);
    fireflies.material.uniforms.uSize.value = 60 * renderer.getPixelRatio() * (innerHeight / 900);
  };
  addEventListener('resize', resize);
  resize();

  ui.loading.hidden = true;
  if (params.has('shot')) {
    ui.hud.hidden = true;
    window.__game = { player, camera, atmosphere }; // hook for automated tests
  } else {
    ui.overlay.hidden = false;
    ui.hud.hidden = false;
  }
  updateMode();

  let last = performance.now();
  let time = 0;
  let frames = 0;
  let fpsTime = 0;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    windUniforms.uTime.value = time;
    sky.material.uniforms.uTime.value = time;
    fireflies.material.uniforms.uTime.value = time;

    player.update(dt);
    sky.position.copy(camera.position);
    culler.update(camera.position);
    atmosphere.update(dt, camera.position);
    composer.render();

    frames++;
    fpsTime += dt;
    if (fpsTime > 0.5) {
      ui.fps.textContent = `${Math.round(frames / fpsTime)} fps`;
      frames = 0;
      fpsTime = 0;
      window.__frames = (window.__frames ?? 0) + 1; // lets automated screenshots know we're rendering
    }
  });
}

main().catch((err) => {
  console.error(err);
  ui.text.textContent = `Erro ao carregar: ${err.message}`;
});
