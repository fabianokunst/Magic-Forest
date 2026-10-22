import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadAssets } from './core/assets.js';
import { Hud } from './core/hud.js';
import { Input } from './core/input.js';
import { Sfx } from './core/audio.js';
import { pointUniforms } from './core/fx.js';
import { ICONS } from './core/icons.js';
import { loadProgress, saveProgress } from './core/save.js';
import { ForestWorld } from './forest/world.js';
import { PHASES, ALL_PHASES_OPEN } from './phases.js';

// Na URL: ?fase=2 abre direto a fase 2 (e libera as anteriores).
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 220);

// alvo HDR com MSAA: o bloom pega lanternas e olhos das sombras, e as bordas das folhas ficam suaves
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
const renderPass = new RenderPass(new THREE.Scene(), camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.55, 0.8);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const hud = new Hud();
const sfx = new Sfx();
const input = new Input(canvas);
hud.screen('loading');

const app = {
  renderer, camera, hud, sfx, input, bloom,
  assets: null,
  forest: null,
  phase: null,     // fase na tela
  info: null,      // dados da fase na tela (PHASES)
  built: {},       // fases ja montadas, por id
  progress: loadProgress(),

  getForest() {
    this.forest ??= new ForestWorld(this);
    return this.forest;
  },

  phaseEnded(phase, r) {
    if (phase !== this.phase) return;
    const id = this.info.id;
    if (r.win) {
      const best = this.progress.stars[id] ?? 0;
      this.progress.stars[id] = Math.max(best, r.stars);
      saveProgress(this.progress);
    }
    const last = id === PHASES.length;
    const sub = r.win && last ? `${r.sub} Você completou o dia inteiro do ogro!` : r.sub;
    hud.showHud(false);
    hud.showEnd({ ...r, sub, next: r.win && !last });
  },
};
window.__app = app; // para os testes automaticos

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const px = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  pointUniforms.uScale.value = px / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  app.forest?.onResize();
}
addEventListener('resize', resize);
resize();

const unlocked = (id) => ALL_PHASES_OPEN || id === 1 || (app.progress.stars[id - 1] ?? 0) > 0;

// ------------------------------------------------------------- troca de fase

function activate(info, phase) {
  if (app.phase && app.phase !== phase) app.phase.exit();
  app.phase = phase;
  app.info = info;
  phase.enter();
  const v = phase.view;
  camera.fov = v.fov;
  camera.near = v.near;
  camera.far = v.far;
  resize();
  renderPass.scene = phase.scene;
  if (v.exposure) renderer.toneMappingExposure = v.exposure;
  if (v.bloom) [bloom.strength, bloom.radius, bloom.threshold] = v.bloom;
}

async function openPhase(id) {
  const info = PHASES[id - 1];
  let phase = app.built[id];
  if (!phase) {
    hud.screen('loading');
    hud.setLoading(1, info.forest ? 'Plantando a floresta…' : 'Preparando a fase…');
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    phase = app.built[id] = info.make(app);
  }
  if (phase !== app.phase) {
    activate(info, phase);
    phase.reset();
    await renderer.compileAsync(phase.scene, camera);
  } else {
    phase.reset();
  }
  return phase;
}

// ------------------------------------------------------------- telas

function showMenu() {
  hud.showHud(false);
  if (app.phase && app.phase.state !== 'menu') app.phase.reset();
  const total = Object.values(app.progress.stars).reduce((a, b) => a + b, 0);
  $('menu-stars').textContent = total ? `★ ${total} de ${PHASES.length * 3}` : '';
  $('phase-cards').innerHTML = PHASES.map((p) => {
    const open = unlocked(p.id);
    const stars = app.progress.stars[p.id] ?? 0;
    return `<button class="phase-card t-${p.theme}${open ? '' : ' locked'}" data-id="${p.id}" ${open ? '' : 'disabled'}>
      <span class="pc-top"><span class="pc-num">Fase ${p.id}</span><span class="pc-when">${p.icon}${p.when}</span></span>
      <b class="pc-title">${p.title}</b>
      <span class="pc-short">${p.short}</span>
      ${open
        ? `<span class="pc-stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('')}</span>`
        : `<span class="pc-lock">${ICONS.lock} Vença a fase ${p.id - 1}</span>`}
    </button>`;
  }).join('');
  hud.screen('menu');
}

function showIntro(info) {
  $('intro-kicker').innerHTML = `${info.icon} Fase ${info.id} · ${info.when}`;
  $('intro-title').textContent = info.title;
  $('intro-story').innerHTML = info.story;
  $('intro-controls').innerHTML = [...info.controls, `${'<kbd>Esc</kbd>'} pausa &nbsp; <kbd>M</kbd> som`]
    .map((c) => `<li>${c}</li>`).join('');
  $('intro-tips').innerHTML = info.tips.map(([dot, t]) => `<li><span class="dot ${dot}"></span>${t}</li>`).join('');
  $('screen-intro').className = `screen t-${info.theme}`;
  hud.screen('intro');
}

async function choosePhase(id) {
  if (!unlocked(id)) return;
  await openPhase(id);
  showIntro(PHASES[id - 1]);
}

function play() {
  const phase = app.phase;
  hud.screen(null);
  phase.hudSetup();
  hud.showHud(true);
  phase.start();
  input.requestLock();
}

function pause() {
  app.phase.pause();
  hud.screen('pause');
}

function resume() {
  app.phase.resume();
  hud.screen(null);
  input.requestLock();
}

$('phase-cards').addEventListener('click', (e) => {
  const card = e.target.closest('.phase-card');
  if (card && !card.disabled) choosePhase(Number(card.dataset.id));
});
$('btn-back').addEventListener('click', showMenu);
$('btn-start').addEventListener('click', play);
$('btn-resume').addEventListener('click', resume);
$('btn-retry').addEventListener('click', () => {
  app.phase.reset();
  play();
});
$('btn-quit').addEventListener('click', showMenu);
$('btn-restart').addEventListener('click', () => {
  app.phase.reset();
  play();
});
$('btn-next').addEventListener('click', () => choosePhase(app.info.id + 1));
$('btn-menu').addEventListener('click', showMenu);

canvas.addEventListener('click', () => {
  if (app.phase?.state === 'playing') input.requestLock();
});
input.onLockChange = (locked) => {
  if (!locked && app.phase?.state === 'playing' && !app.phase.bot) pause();
};
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') sfx.toggleMute();
  if (e.code === 'Escape' && app.phase?.state === 'playing' && !input.locked) pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.phase?.state === 'playing' && !app.phase.bot) pause();
});

// ------------------------------------------------------------- inicio

boot().catch((err) => {
  console.error(err);
  hud.screen('loading');
  hud.setLoading(0, 'Erro ao carregar: ' + err.message);
});

async function boot() {
  app.assets = await loadAssets((p) => hud.setLoading(p));
  const wanted = Number(params.get('fase'));
  if (wanted >= 2 && wanted <= PHASES.length) {
    for (let i = 1; i < wanted; i++) app.progress.stars[i] = Math.max(1, app.progress.stars[i] ?? 0);
  }

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 1 / 20);
    const phase = app.phase;
    if (phase && phase.state !== 'paused') phase.update(dt);
    hud.update(dt);
    composer.render();
    input.endFrame();
  });

  if (PHASES[wanted - 1]) {
    await choosePhase(wanted);
  } else {
    await openPhase(1);
    showMenu();
  }
}
