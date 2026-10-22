import * as THREE from 'three';
import { DUSK } from './config.js';
import { Mushrooms } from './mushrooms.js';
import { Stalkers } from './stalkers.js';
import { OGRE_SCALE } from '../forest/world.js';
import { CameraRig } from '../core/camera.js';
import { ParticlePool, Rings } from '../core/fx.js';
import { Phase, clockText, starsFor } from '../core/phase.js';
import { ICONS } from '../core/icons.js';

const D = DUSK;
const rand = (a, b) => a + Math.random() * (b - a);
const smoothstep = THREE.MathUtils.smoothstep;

// Fase 3 — Cogumelos do Entardecer: colher os cogumelos-luz vigiando as sombras.
export class DuskPhase extends Phase {
  constructor(app) {
    super(app);
    this.world = app.getForest();
    this.scene = this.world.scene;
    this.ogre = this.world.ogre;
    this.group = new THREE.Group();
    this.rig = new CameraRig(this.camera, OGRE_SCALE);
    this.fx = {
      add: new ParticlePool(this.group, 700, THREE.AdditiveBlending, 1.5),
      norm: new ParticlePool(this.group, 500, THREE.NormalBlending, 1.0),
    };
    this.fx.norm.buf.points.renderOrder = 1;
    this.fx.add.buf.points.renderOrder = 3;
    this.rings = new Rings(this.group);
    this.mushrooms = new Mushrooms(this.group, this.world);
    this.stalkers = new Stalkers(this.group, this.world);
    // o olhar do ogro: um facho de luz quente que aparece mais quando escurece
    this.gazeLight = new THREE.SpotLight(0xffd9a0, 0, D.stalker.see + 6, Math.acos(D.stalker.cone), 0.55, 1.2);
    this.group.add(this.gazeLight, this.gazeLight.target);
    this.moveDir = { x: 0, z: 0 };
    this._bucket = new THREE.Vector3();
    // arvores do bosque, para o minimapa
    this.mapTrees = this.world.trees.filter((t) => Math.hypot(t.x - D.center.x, t.z - D.center.z) < D.radius + 10);
    this.map = {
      cx: D.center.x, cz: D.center.z, radius: D.radius, yaw: 0, ogre: { x: 0, z: 0, yaw: 0 },
      background: 'rgba(30,20,34,0.9)',
      draw: (c, S, t) => this._drawMap(c, S, t),
    };
    this.ctx = {
      ogre: this.ogre.pos, camPos: this.camera.position, progress: 0, active: false,
      gaze: { x: 0, z: 0, fx: 0, fz: 1 },
      onCatch: (s) => this._onCatch(s),
      onFreeze: (s, d) => {
        if (d < 14 && this.once('freeze', 1.2)) this.sfx.giggle();
      },
      onNear: () => {
        if (this.once('near', 3)) {
          this.sfx.giggle();
          this.hud.flash(0.35);
        }
      },
    };
    this.reset();
  }

  get view() {
    return { fov: 55, near: 0.1, far: 600 };
  }

  enter() {
    this.scene.add(this.group);
    this.world.bound = { x: D.center.x, z: D.center.z, r: D.radius };
    this.world.atmosphere.bloom = this.app.bloom;
    this.world.atmosphere.setTime(D.sky[0]);
    this.ogre.orbColor = [2.4, 0.8, 1.5];
    this.sfx.ambient('dusk');
  }

  exit() {
    this.scene.remove(this.group);
    this.world.bound = null;
    this.ogre.orbColor = [0.55, 2.4, 1.0];
  }

  hudSetup() {
    this.hud.configure({
      goal: { icon: ICONS.mushroom, label: 'Cogumelos', theme: 'mush' },
      clock: { from: ICONS.sunset, to: ICONS.moon, theme: 'dusk' },
    });
  }

  _spots() {
    const spots = [];
    const S = D.spawn;
    for (let tries = 0; spots.length < D.mushrooms && tries < 6000; tries++) {
      const a = Math.random() * Math.PI * 2, r = rand(S.min, S.max);
      const x = D.center.x + Math.cos(a) * r, z = D.center.z + Math.sin(a) * r;
      const gap = tries < 3000 ? S.gap : S.gap * 0.6;
      if (!this.world.isFree(x, z, 1.4)) continue;
      if (Math.hypot(x - D.start.x, z - D.start.z) < 5) continue;
      if (spots.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < gap)) continue;
      spots.push([x, z]);
    }
    return spots;
  }

  reset() {
    this._resetBase();
    this.time = 0;
    this.progress = 0;
    this.carried = 0;
    this.roarCd = 0;
    this.spawnT = D.stalker.first;
    this.stats = { roars: 0, caught: 0, scared: 0 };
    this.tutorial = {};
    const w = this.world;
    const a = Math.atan2(D.center.x - D.start.x, D.center.z - D.start.z);
    this.ogre.place(D.start.x, D.start.z, a, w.heightAt(D.start.x, D.start.z));
    this.ogre.setMode('play');
    this.rig.yaw = a + Math.PI;
    this.rig.pitch = 0.3;
    this.rig.snap(this.ogre.pos);
    this.mushrooms.reset(this._spots());
    this.total = this.mushrooms.spots.length;
    this.stalkers.reset();
    this.fx.add.clear();
    this.fx.norm.clear();
    if (this.app.phase === this) this.world.atmosphere.setTime(D.sky[0]);
  }

  start() {
    this.state = 'playing';
    this.sfx.start();
    this.sfx.chime();
    this.hud.banner('<small>Fase 3</small>Cogumelos do Entardecer');
    this.later(1.2, () => this.hud.toast('Colha os <b class="c-mush">cogumelos-luz</b> do bosque', '', 4));
    this.later(D.stalker.first + 1.5, () => this.hud.toast('Batatinha frita! As <b class="c-shadow">sombras</b> só andam quando o ogro está de costas', 'warn', 4.5));
    this.later(D.stalker.first + 7, () => this.hud.toast('Parado, o ogro olha para onde a câmera aponta', '', 4));
  }

  update(dt) {
    this._tickPending(dt);
    const playing = this.playing;
    const t = this.clock;
    const og = this.ogre;

    if (playing) {
      this.time += dt;
      this.progress = Math.min(1, this.time / D.seconds);
      this.roarCd = Math.max(0, this.roarCd - dt);
      const c = this.readControls();
      this.moveDir.x = c.mx;
      this.moveDir.z = c.mz;
      this.wantRun = c.run;
      if (c.roar) this._roar();
      // parado, o ogro olha para onde a camera aponta
      if (!c.mx && !c.mz) {
        const f = this.rig.forward();
        og.faceToward(f.x, f.z, 0.12);
      }
      this._director(dt);
    } else {
      this.moveDir.x = this.moveDir.z = 0;
      this.wantRun = false;
    }
    og.update(dt, this.moveDir, this.wantRun, this.world);
    og.updateBucket(t, this.carried, 0);

    // o sol vai baixando ate anoitecer
    const sky = THREE.MathUtils.lerp(D.sky[0], D.sky[1], this.progress);
    if (playing) this.world.atmosphere.setTime(sky);
    this.sfx.evening = smoothstep(this.progress, 0.35, 0.85);

    const orbit = this.state === 'menu' || this.over;
    this.rig.update(dt, this.input, og.pos, this.world, orbit);
    const gaze = this.ctx.gaze;
    gaze.x = og.pos.x;
    gaze.z = og.pos.z;
    gaze.fx = Math.sin(og.yaw);
    gaze.fz = Math.cos(og.yaw);
    const glow = smoothstep(sky, 0.3, 0.8);
    this.gazeLight.position.set(og.pos.x + gaze.fx * 0.5, og.pos.y + 1.8, og.pos.z + gaze.fz * 0.5);
    this.gazeLight.target.position.set(og.pos.x + gaze.fx * 12, og.pos.y, og.pos.z + gaze.fz * 12);
    this.gazeLight.intensity = this.over ? 0 : 1 + glow * 9;

    this.mushrooms.update(dt, t, {
      ogre: og.pos, reach: D.reach, canPick: playing && og.mode === 'play',
      bucket: og.bucketWorld(this._bucket), glow,
      onPick: (m) => this._onPick(m),
    });
    const ctx = this.ctx;
    ctx.progress = this.progress;
    ctx.active = playing && og.invuln <= 0;
    this.stalkers.update(dt, t, ctx);
    this.fx.add.update(dt);
    this.fx.norm.update(dt);
    this.rings.update(dt);
    this.world.update(dt, t, this.camera.position, og.pos);

    if (playing || this.state === 'paused') this._updateHud(t);
    if (playing) {
      this._hints();
      if (this.carried >= this.total) this._win();
      else if (this.time >= D.seconds) this._timeUp();
    }
  }

  _director(dt) {
    const S = D.stalker;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const max = Math.round(THREE.MathUtils.lerp(S.max[0], S.max[1], this.progress));
    if (this.stalkers.active.length < max) this.stalkers.spawn(this.ogre.pos);
    this.spawnT = this.stalkers.active.length < max ? S.respawn : S.every * rand(0.8, 1.2);
  }

  _updateHud(t) {
    const hud = this.hud;
    hud.setGoal(this.carried / this.total, `${this.carried}/${this.total}`);
    hud.setClock(clockText(17.5 * 60 + this.progress * 90), this.progress);
    hud.setRoar(this.roarCd, D.roar.cooldown);
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
    const R = D.roar;
    this.roarCd = R.cooldown;
    this.stats.roars++;
    og.playOneShot('Roar', { lock: R.lock, fadeIn: 0.08, fadeOut: 0.25 });
    this.sfx.roar();
    this.later(0.22, () => {
      const o = og.pos;
      this.rig.shake = Math.max(this.rig.shake, 0.6);
      this.rings.spawn(o.x, o.z, R.radius, 0xffc46b, 0.6, o.y + 0.1);
      this.rings.spawn(o.x, o.z, R.radius * 0.7, 0xb77dff, 0.8, o.y + 0.1);
      const n = this.stalkers.roar(o.x, o.z, R.radius);
      this.stats.scared += n;
      if (n >= 1) {
        this.sfx.shadowDie();
        this.hud.toast(n > 1 ? `RUAAARGH! ${n} sombras fugiram!` : 'RUAAARGH! A sombra fugiu!', 'good', 1.8);
      }
    });
  }

  _onPick(m) {
    this.carried++;
    this.sfx.mushroom(this.carried);
    const p = m.root.position;
    this.fx.add.burst(16, () => ({
      x: p.x, y: p.y + 0.5, z: p.z, vx: rand(-1.5, 1.5), vy: rand(0.5, 3), vz: rand(-1.5, 1.5),
      life: rand(0.5, 0.9), s0: 0.12, s1: 0, r: 2.4, g: 1, b: 1.8, a0: 1, a1: 0, drag: 2, grav: 2,
    }));
    const left = this.total - this.carried;
    if (left > 0 && left <= 3) this.hud.toast(left === 1 ? 'Falta só 1 cogumelo!' : `Faltam ${left} cogumelos!`, 'good', 1.8);
  }

  _onCatch(s) {
    const og = this.ogre;
    if (og.invuln > 0 || !this.playing) return;
    this.stats.caught++;
    this.stalkers.scare(s, og.pos.x, og.pos.z);
    // o grito do ogro tambem espanta as que estavam por perto (evita sustos em sequencia)
    for (const o of this.stalkers.active) {
      if (Math.hypot(o.x - og.pos.x, o.z - og.pos.z) < 8) this.stalkers.scare(o, og.pos.x, og.pos.z);
    }
    og.hit(s.x, s.z);
    this.sfx.boo();
    this.hud.flash(1);
    this.rig.shake = Math.max(this.rig.shake, 0.5);
    const n = Math.min(D.drop, this.carried);
    if (n > 0) {
      this.carried -= n;
      const b = og.bucketWorld(new THREE.Vector3());
      this.mushrooms.drop(b.x, b.y, b.z, n);
      this.hud.toast(`BU! Uma sombra assustou o ogro e ${n > 1 ? `caíram ${n} cogumelos` : 'caiu um cogumelo'}!`, 'warn', 2.6);
    } else {
      this.hud.toast('BU! Uma sombra pegou você de surpresa!', 'warn', 2.2);
    }
  }

  _hints() {
    if (this.needsLockHint()) return;
    const o = this.ogre.pos;
    const behind = this.stalkers.active.some((s) => !s.frozen && Math.hypot(s.x - o.x, s.z - o.z) < D.stalker.hear);
    if (behind) return this.hud.hint('Tem uma sombra nas costas do ogro! Vire para ela ou ruja <kbd>Espaço</kbd>');
    if (!this.tutorial.looked && this.stalkers.active.some((s) => s.frozen && s.state === 'stalk')) {
      this.tutorial.looked = true;
      this.hud.toast('Viu? Quando o ogro olha, ela congela e fecha os olhinhos', '', 3.5);
    }
    this.hud.hint(null);
  }

  _drawMap(c, S, time) {
    const o = this.ogre.pos;
    // leque: para onde o ogro olha
    const g = this.ctx.gaze;
    const half = Math.acos(D.stalker.cone);
    const ang = Math.atan2(g.fz, g.fx);
    const grd = c.createRadialGradient(o.x * S, o.z * S, 0, o.x * S, o.z * S, D.stalker.see * S);
    grd.addColorStop(0, 'rgba(255,230,170,0.35)');
    grd.addColorStop(1, 'rgba(255,230,170,0)');
    c.fillStyle = grd;
    c.beginPath();
    c.moveTo(o.x * S, o.z * S);
    c.arc(o.x * S, o.z * S, D.stalker.see * S, ang - half, ang + half);
    c.closePath();
    c.fill();

    c.fillStyle = 'rgba(120,50,60,0.75)';
    for (const t of this.mapTrees) {
      c.beginPath();
      c.arc(t.x * S, t.z * S, Math.max(1.5, t.canopyR * 0.5 * S), 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#c99a5b';
    const h = 3.6 * S;
    c.fillRect(D.center.x * S - h, D.center.z * S - h, h * 2, h * 2);

    const pulse = 0.6 + 0.4 * Math.sin(time * 4);
    c.fillStyle = `rgba(255,140,190,${pulse})`;
    for (const m of [...this.mushrooms.spots.filter((s) => !s.taken), ...this.mushrooms.loose]) {
      c.beginPath();
      c.arc(m.x * S, m.z * S, 3, 0, Math.PI * 2);
      c.fill();
    }
    for (const s of this.stalkers.list) {
      if (s.state === 'flee') continue;
      c.fillStyle = s.frozen ? '#7b5aa6' : Math.floor(time * 8) % 2 ? '#ff4a8a' : '#b77dff';
      c.beginPath();
      c.arc(s.x * S, s.z * S, 3.6, 0, Math.PI * 2);
      c.fill();
    }
  }

  // ------------------------------------------------------------- fim

  _stats() {
    const left = Math.max(0, D.seconds - this.time);
    return [
      ['Cogumelos', `${this.carried} de ${this.total}`],
      ['Tempo sobrando', `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`],
      ['Sustos levados', this.stats.caught],
      ['Sombras espantadas', this.stats.scared],
    ];
  }

  _end() {
    for (const s of this.stalkers.active) this.stalkers.scare(s, this.ogre.pos.x, this.ogre.pos.z);
  }

  _win() {
    this._end();
    this.finish({
      win: true,
      stars: starsFor({ complete: true, timeLeft: D.seconds - this.time, great: D.great }),
      title: 'Sopa garantida!',
      sub: 'O ogro colheu todos os cogumelos-luz antes de anoitecer.',
      stats: this._stats(),
    }, 3);
  }

  _timeUp() {
    this._end();
    if (this.carried >= D.pass) {
      this.finish({
        win: true,
        stars: 1,
        title: 'Anoiteceu!',
        sub: `O ogro voltou para casa com ${this.carried} cogumelos. Dá para uma sopinha!`,
        stats: this._stats(),
      }, 2.6);
    } else {
      this.finish({
        win: false,
        stars: 0,
        title: 'Escureceu antes da hora…',
        sub: `Precisava de pelo menos ${D.pass} cogumelos. Tente de novo!`,
        stats: this._stats(),
      }, 2.6);
    }
  }
}
