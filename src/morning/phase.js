import * as THREE from 'three';
import { MORNING } from './config.js';
import { ShadeMap } from './shade.js';
import { DayShadows } from './shadows.js';
import { Butterflies } from './butterflies.js';
import { OGRE_SCALE } from '../forest/world.js';
import { SUN_DIR } from '../forest/atmosphere.js';
import { CameraRig } from '../core/camera.js';
import { ParticlePool, Rings } from '../core/fx.js';
import { Phase, clockText, starsFor } from '../core/phase.js';
import { ICONS } from '../core/icons.js';

const M = MORNING;
const rand = (a, b) => a + Math.random() * (b - a);
const U = M.shadow.unit;

// Fase 2 — Sol da Manha: espantar as sombras escondidas para o sol, onde viram borboletas.
export class MorningPhase extends Phase {
  constructor(app) {
    super(app);
    this.world = app.getForest();
    this.scene = this.world.scene;
    this.ogre = this.world.ogre;
    this.group = new THREE.Group(); // personagens desta fase (sai da cena quando a fase muda)
    this.rig = new CameraRig(this.camera, OGRE_SCALE);
    this.shade = new ShadeMap(this.world, M.center, M.radius + 6, SUN_DIR);
    this.fx = {
      add: new ParticlePool(this.group, 900, THREE.AdditiveBlending, 1.5),
      norm: new ParticlePool(this.group, 900, THREE.NormalBlending, 1.0),
    };
    this.fx.norm.buf.points.renderOrder = 1;
    this.fx.add.buf.points.renderOrder = 3;
    this.rings = new Rings(this.group);
    this.shadows = new DayShadows(this.group, this.world, this.shade, this.fx);
    this.butterflies = new Butterflies(this.group, this.world);
    this.moveDir = { x: 0, z: 0 };
    this.map = {
      cx: M.center.x, cz: M.center.z, radius: M.radius, yaw: 0, ogre: { x: 0, z: 0, yaw: 0 },
      background: '#2c4a2e',
      draw: (c, S, t) => this._drawMap(c, S, t),
    };
    this.ctx = {
      ogre: this.ogre.pos, running: false, active: false, camPos: this.camera.position,
      onTransform: (s) => this._onTransform(s),
      onScared: () => this.once('squeak', 0.4) && this.sfx.squeak(),
      onSizzle: () => this.once('sizzle', 0.2) && this.sfx.sizzle(),
    };
    this.reset();
  }

  get view() {
    return { fov: 55, near: 0.1, far: 600 }; // luz, exposicao e bloom vem da atmosfera da floresta
  }

  enter() {
    this.scene.add(this.group);
    this.world.bound = { x: M.center.x, z: M.center.z, r: M.radius };
    this.world.atmosphere.bloom = this.app.bloom;
    this.world.atmosphere.setTime(0);
    this.sfx.ambient('day');
  }

  exit() {
    this.scene.remove(this.group);
    this.world.bound = null;
  }

  hudSetup() {
    this.hud.configure({
      goal: { icon: ICONS.butterfly, label: 'Borboletas', theme: 'sun' },
      clock: { from: ICONS.sunrise, to: ICONS.sun, theme: 'morning' },
    });
  }

  // esconderijos: bem na sombra, longe uns dos outros e longe do ogro
  _spots() {
    const spots = [];
    const S = M.spawn;
    for (let tries = 0; spots.length < M.shadows && tries < 6000; tries++) {
      const a = Math.random() * Math.PI * 2, r = rand(S.min, S.max);
      const x = M.center.x + Math.cos(a) * r, z = M.center.z + Math.sin(a) * r;
      const gap = tries < 3000 ? S.gap : S.gap * 0.6;
      if (this.shade.at(x, z) < 0.85 || !this.world.isFree(x, z, 1.2)) continue;
      if (Math.hypot(x - M.start.x, z - M.start.z) < 14) continue;
      if (spots.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < gap)) continue;
      spots.push([x, z]);
    }
    return spots;
  }

  reset() {
    this._resetBase();
    this.time = 0;
    this.count = 0;
    this.roarCd = 0;
    this.stats = { roars: 0 };
    this.tutorial = {};
    const w = this.world;
    this.ogre.place(M.start.x, M.start.z, 0, w.heightAt(M.start.x, M.start.z));
    this.ogre.setMode('play');
    this.ogre.updateBucket(0, 0, 0);
    this.rig.yaw = Math.PI;
    this.rig.pitch = 0.3;
    this.rig.snap(this.ogre.pos);
    this.shadows.reset(this._spots());
    this.total = this.shadows.list.length;
    this.butterflies.reset();
    this.fx.add.clear();
    this.fx.norm.clear();
  }

  start() {
    this.state = 'playing';
    this.sfx.start();
    this.sfx.chime();
    this.hud.banner('<small>Fase 2</small>Sol da Manhã');
    this.later(1.2, () => this.hud.toast('As <b class="c-shadow">sombras</b> se esconderam na sombra das árvores', '', 4));
    this.later(5.5, () => this.hud.toast('Espante-as para o <b>sol</b>: elas viram <b class="c-butterfly">borboletas</b>!', '', 4.5));
  }

  update(dt) {
    this._tickPending(dt);
    const playing = this.playing;
    const t = this.clock;
    const og = this.ogre;

    if (playing) {
      this.time += dt;
      this.roarCd = Math.max(0, this.roarCd - dt);
      const c = this.readControls();
      this.moveDir.x = c.mx;
      this.moveDir.z = c.mz;
      this.wantRun = c.run;
      if (c.roar) this._roar();
    } else {
      this.moveDir.x = this.moveDir.z = 0;
      this.wantRun = false;
    }
    og.update(dt, this.moveDir, this.wantRun, this.world);
    og.updateBucket(t, 0, 0);

    const ctx = this.ctx;
    ctx.running = this.wantRun && og.speed > og.walkSpeed * 1.2;
    ctx.active = playing;
    this.shadows.update(dt, t, ctx);
    this.butterflies.update(dt, t, {
      home: { x: M.center.x, z: M.center.z + 4, r: 14 }, ogre: og.pos, swirl: this.state === 'won',
    });
    this.fx.add.update(dt);
    this.fx.norm.update(dt);
    this.rings.update(dt);

    const orbit = this.state === 'menu' || this.over;
    this.rig.update(dt, this.input, og.pos, this.world, orbit);
    this.world.update(dt, t, this.camera.position, og.pos);

    if (playing || this.state === 'paused') this._updateHud(t);
    if (playing) {
      this._hints();
      if (this.count >= this.total) this._win();
      else if (this.time >= M.seconds) this._timeUp();
    }
  }

  _updateHud(t) {
    const hud = this.hud;
    const p = Math.min(1, this.time / M.seconds);
    hud.setGoal(this.count / this.total, `${this.count}/${this.total}`);
    hud.setClock(clockText(7 * 60 + p * 300), p);
    hud.setRoar(this.roarCd, M.roar.cooldown);
    const m = this.map;
    m.yaw = this.rig.yaw;
    m.ogre.x = this.ogre.pos.x;
    m.ogre.z = this.ogre.pos.z;
    m.ogre.yaw = this.ogre.yaw;
    hud.minimap(m, t);
  }

  _roar() {
    const og = this.ogre;
    if (this.roarCd > 0 || og.busy || og.mode !== 'play') return;
    const R = M.roar;
    this.roarCd = R.cooldown;
    this.stats.roars++;
    og.playOneShot('Roar', { lock: R.lock, fadeIn: 0.08, fadeOut: 0.25 });
    this.sfx.roar();
    this.later(0.22, () => {
      const o = og.pos;
      this.rig.shake = Math.max(this.rig.shake, 0.6);
      this.rings.spawn(o.x, o.z, R.radius, 0xffc46b, 0.6, o.y + 0.1);
      this.rings.spawn(o.x, o.z, R.radius * 0.7, 0xffe7a8, 0.8, o.y + 0.1);
      this.fx.norm.burst(30, (i) => {
        const a = (i / 30) * Math.PI * 2;
        return {
          x: o.x, y: o.y + 0.2, z: o.z, vx: Math.cos(a) * rand(6, 10), vy: rand(0.5, 2), vz: Math.sin(a) * rand(6, 10),
          life: rand(0.6, 1), s0: 0.3, s1: 1.1, r: 0.55, g: 0.48, b: 0.36, a0: 0.35, a1: 0, drag: 3.5,
        };
      });
      const n = this.shadows.roar(o.x, o.z);
      if (n >= 2) this.hud.toast(`RUAAARGH! ${n} sombras voando!`, 'good', 1.8);
    });
  }

  _onTransform(s) {
    this.count++;
    const y = s.y + 0.5 * U;
    this.butterflies.spawn(s.x, y, s.z);
    this.sfx.transform();
    this.rings.spawn(s.x, s.z, 3.5, 0xffd45a, 0.7, s.y + 0.1);
    const colors = [[2.4, 1.2, 2], [2.4, 2.1, 0.6], [0.8, 1.8, 2.4], [1.4, 2.4, 1]];
    this.fx.add.burst(40, (i) => {
      const [r, g, b] = colors[i % 4];
      return {
        x: s.x, y, z: s.z, vx: rand(-4, 4), vy: rand(0.5, 5), vz: rand(-4, 4),
        life: rand(0.6, 1.2), s0: 0.16, s1: 0, r, g, b, a0: 1, a1: 0, drag: 2.5, grav: 3,
      };
    });
    const left = this.total - this.count;
    if (left > 0) {
      this.hud.toast(`Virou borboleta! ${left === 1 ? 'Falta só 1!' : `Faltam ${left}.`}`, 'good', 2);
    }
    this.tutorial.first = true;
  }

  _hints() {
    if (this.needsLockHint()) return;
    const o = this.ogre.pos;
    let near = null, nd = Infinity;
    for (const s of this.shadows.alive) {
      const d = Math.hypot(s.x - o.x, s.z - o.z);
      if (d < nd) { nd = d; near = s; }
    }
    if (near && near.sun > 0.05) return this.hud.hint('Está queimando no sol! Não deixe ela voltar para a sombra');
    if (near && nd < M.roar.radius * 0.9 && this.roarCd <= 0 && !this.tutorial.first) {
      return this.hud.hint('<kbd>Espaço</kbd> rugir: jogue a sombra para o sol!');
    }
    if (near && nd > 30 && this.once('lost', 12)) {
      this.hud.toast('Procure os pontinhos roxos no minimapa', '', 2.5);
    }
    this.hud.hint(null);
  }

  _drawMap(c, S, time) {
    const sh = this.shade;
    c.imageSmoothingEnabled = true;
    c.drawImage(sh.canvas, sh.x0 * S, sh.z0 * S, sh.size * S, sh.size * S);
    // cabana
    c.fillStyle = '#c99a5b';
    c.fillRect(-3 * S, -3 * S, 6 * S, 6 * S);
    c.fillStyle = 'rgba(255,190,230,0.9)';
    for (const b of this.butterflies.list) c.fillRect(b.root.position.x * S - 1, b.root.position.z * S - 1, 2.5, 2.5);
    for (const s of this.shadows.alive) {
      const blink = s.sun > 0 && Math.floor(time * 10) % 2;
      c.fillStyle = blink ? '#ffb35a' : '#5b2d8a';
      c.strokeStyle = '#e6c8ff';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(s.x * S, s.z * S, 3.6, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }

  // ------------------------------------------------------------- fim

  _stats() {
    const left = Math.max(0, M.seconds - this.time);
    return [
      ['Borboletas', `${this.count} de ${this.total}`],
      ['Tempo sobrando', `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`],
      ['Rugidos', this.stats.roars],
    ];
  }

  _win() {
    const left = M.seconds - this.time;
    this.finish({
      win: true,
      stars: starsFor({ complete: true, timeLeft: left, great: M.great }),
      title: 'Que manhã linda!',
      sub: 'Todas as sombras viraram borboletas.',
      stats: this._stats(),
    }, 3);
  }

  _timeUp() {
    for (const s of this.shadows.alive) {
      s.state = 'dying';
      s.t = 0;
    }
    if (this.count >= M.pass) {
      this.finish({
        win: true,
        stars: 1,
        title: 'Meio-dia!',
        sub: `${this.count} sombras viraram borboletas. As outras fugiram para a mata fechada.`,
        stats: this._stats(),
      }, 2.6);
    } else {
      this.finish({
        win: false,
        stars: 0,
        title: 'As sombras escaparam…',
        sub: `Precisava de pelo menos ${M.pass} borboletas. Tente de novo!`,
        stats: this._stats(),
      }, 2.6);
    }
  }
}
