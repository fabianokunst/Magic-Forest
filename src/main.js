import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadAssets } from './assets.js';
import { Game } from './game.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { pointUniforms } from './fx.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070b1a, 0.05);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 220);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.55, 0.8));
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const px = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  pointUniforms.uScale.value = px / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
addEventListener('resize', resize);
resize();

const hud = new Hud();
const sfx = new Sfx();
const input = new Input(canvas);
hud.screen('loading');

boot().catch((err) => {
  console.error(err);
  document.querySelector('#screen-loading .sub').textContent = 'Erro ao carregar: ' + err.message;
});

async function boot() {
  const assets = await loadAssets((p) => hud.setLoading(p));
  const game = new Game({ scene, camera, assets, hud, sfx, input });
  window.__game = game;
  hud.screen('start');

  const begin = () => {
    hud.screen(null);
    hud.showHud(true);
    input.requestLock();
  };
  const pause = () => {
    game.pause();
    hud.screen('pause');
  };

  document.getElementById('btn-start').addEventListener('click', () => {
    game.start();
    begin();
  });
  document.getElementById('btn-resume').addEventListener('click', () => {
    game.resume();
    begin();
  });
  document.getElementById('btn-restart').addEventListener('click', () => {
    game.reset();
    game.start();
    begin();
  });

  canvas.addEventListener('click', () => {
    if (game.state === 'playing') input.requestLock();
  });
  input.onLockChange = (locked) => {
    if (!locked && game.state === 'playing') pause();
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') sfx.toggleMute();
    if (e.code === 'Escape' && game.state === 'playing' && !input.locked) pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') pause();
  });

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 1 / 20);
    if (game.state !== 'paused') game.update(dt);
    composer.render();
    input.endFrame();
  });
}
