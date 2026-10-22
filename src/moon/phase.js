import * as THREE from 'three';
import { MOON } from './config.js';
import { MoonFlowers } from './flowers.js';
import { Thieves } from './thieves.js';
import { GLADE, GLADE_LAMP, TRAIL, TrailBound, flowerSpots, gardenSpots, nearestOnTrail, trailAt } from './trail.js';
import { OGRE_SCALE } from '../forest/world.js';
import { CameraRig } from '../core/camera.js';
import { ParticlePool, Rings } from '../core/fx.js';
import { Phase, clockText, starsFor } from '../core/phase.js';
import { ICONS } from '../core/icons.js';

const M = MOON;
const U = M.thief.unit;
const rand = (a, b) => a + Math.random() * (b - a);

// Fase 4 — A Trilha das Flores-Lua: levar as flores da trilha para o jardim da cabana sem deixar as sombras roubarem.
export class MoonPhase extends Phase {
  constructor(app) {
    super(app);
    this.world = app.getForest();
    this.scene = this.world.scene;
    this.ogre = this.world.ogre;
    this.group = new THREE.Group();
    this.rig = new CameraRig(this.camera, OGRE_SCALE);
    this.fx = {
      add: new ParticlePool(this.group, 700, THREE.AdditiveBlending, 1.5),
      norm: new ParticlePool(this.group, 300, THREE.NormalBlending, 1.0),
    };
    this.fx.norm.buf.points.renderOrder = 1;
    this.fx.add.buf.points.renderOrder = 3;
    this.rings = new Rings(this.group);
    this.bound = new TrailBound(M.corridor);
    this.flowers = new MoonFlowers(this.group, this.world);
    this.thieves = new Thieves(this.group, this.world, this.bound);
    // luar no ogro: sem ele, longe das flores o ogro sumiria no escuro
    this.moonlight = new THREE.PointLight(0xa8c0ff, M.moonlight, 18, 1.2);
    this.group.add(this.moonlight);
    this.spots = flowerSpots(this.world);
    this.total = this.spots.length;
    this.garden = gardenSpots(this.total);
    this.moveDir = { x: 0, z: 0 };
    this._bucket = new THREE.Vector3();
    this._v = new THREE.Vector3();
    // arvores da trilha, para o minimapa
    const c = M.cabin;
    this.mapTrees = this.world.trees.filter((t) => Math.hypot(t.x - c.x, t.z - c.z) < 40
      || Math.hypot(t.x - GLADE.x, t.z - GLADE.z) < 32 || nearestOnTrail(t.x, t.z).d < M.corridor + 14);
    this.map = {
      cx: 0, cz: 0, radius: 36, yaw: 0, ogre: { x: 0, z: 0, yaw: 0 },
      background: 'rgba(10,16,34,0.9)',
      draw: (ctx, S, t) => this._drawMap(ctx, S, t),
    };
    this.ctx = {
      ogre: this.ogre.pos, vel: this.ogre.vel, carried: 0, progress: 0, active: false, camPos: this.camera.position,
      onSteal: (s) => this._onSteal(s),
      onRecover: (s) => this._onRecover(s),
      onEscape: (s) => this._onEscape(s),
      onNear: () => {
        if (this.once('near', 2.5)) this.sfx.giggle();
      },
    };
    this.reset();
  }

  get view() {
    return { fov: 55, near: 0.1, far: 600 };
  }

  enter() {
    this.scene.add(this.group);
    this.world.bound = this.bound;
    this.world.atmosphere.bloom = this.app.bloom;
    this.world.atmosphere.setTime(M.sky[0]);
    this.ogre.orbColor = [1.0, 2.2, 2.6];
    this.ogre.bucketLight.color.setHex(0x9fe0ff);
    this.sfx.ambient('night');
  }

  exit() {
    this.scene.remove(this.group);
    this.world.bound = null;
    this.ogre.orbColor = [0.55, 2.4, 1.0];
    this.ogre.bucketLight.color.setHex(0x7dffa8);
  }

  hudSetup() {
    this.hud.configure({
      goal: { icon: ICONS.flower, label: 'Flores no jardim', theme: 'moon' },
      clock: { from: ICONS.moon, to: ICONS.stars, theme: 'moon' },
      carry: { icon: ICONS.flower, max: M.bucket },
    });
  }

  reset() {
    this._resetBase();
    this.time = 0;
    this.progress = 0;
    this.carried = 0;
    this.planted = 0;
    this.roarCd = 0;
    this.spawnT = M.thief.first;
    this.stats = { stolen: 0, recovered: 0, roars: 0 };
    this.tutorial = {};
    const w = this.world;
    const ahead = trailAt(M.flowers.from);
    const a = Math.atan2(ahead.x - M.start.x, ahead.z - M.start.z);
    this.ogre.place(M.start.x, M.start.z, a, w.heightAt(M.start.x, M.start.z));
    this.ogre.setMode('play');
    this.rig.yaw = a + Math.PI;
    this.rig.pitch = 0.3;
    this.rig.snap(this.ogre.pos);
    this.flowers.reset(this.spots, this.garden);
    this.thieves.reset();
    this.fx.add.clear();
    this.fx.norm.clear();
    if (this.app.phase === this) this.world.atmosphere.setTime(M.sky[0]);
  }

  start() {
    this.state = 'playing';
    this.sfx.start();
    this.sfx.chime();
    this.hud.banner('<small>Fase 4</small>A Trilha das Flores-Lua');
    this.later(1.2, () => this.hud.toast('Colha as <b class="c-moon">flores-lua</b> da trilha e plante no jardim da cabana', '', 4.5));
    this.later(6, () => this.hud.toast(`No balde cabem ${M.bucket} flores`, '', 3));
  }

  update(dt) {
    this._tickPending(dt);
    const playing = this.playing;
    const t = this.clock;
    const og = this.ogre;

    if (playing) {
      this.time += dt;
      this.progress = Math.min(1, this.time / M.seconds);
      this.roarCd = Math.max(0, this.roarCd - dt);
      const c = this.readControls();
      this.moveDir.x = c.mx;
      this.moveDir.z = c.mz;
      this.wantRun = c.run;
      if (c.roar) this._roar();
      this._director(dt);
    } else {
      this.moveDir.x = this.moveDir.z = 0;
      this.wantRun = false;
    }
    og.update(dt, this.moveDir, this.wantRun, this.world);
    og.updateBucket(t, this.carried, 0);
    if (playing) this.world.atmosphere.setTime(THREE.MathUtils.lerp(M.sky[0], M.sky[1], this.progress));

    // luzes que as sombras nao atravessam: flores no chao, o jardim da cabana e o poste da clareira
    const zones = this.thieves.zones;
    zones.length = 0;
    this.flowers.zones(zones);
    zones.push({ x: M.cabin.x, z: M.cabin.z, r: M.light.garden }, { x: GLADE_LAMP.x, z: GLADE_LAMP.z, r: M.light.lamp });

    this.flowers.update(dt, t, {
      ogre: og.pos, reach: M.reach, bucket: og.bucketWorld(this._bucket),
      canPick: () => this.playing && og.mode === 'play' && this.carried < M.bucket,
      onPick: (f) => this._onPick(f),
    });
    if (playing) this._plant();
    const ctx = this.ctx;
    ctx.carried = this.carried;
    ctx.progress = this.progress;
    ctx.active = playing;
    this.thieves.update(dt, t, ctx);
    this.fx.add.update(dt);
    this.fx.norm.update(dt);
    this.rings.update(dt);

    const orbit = this.state === 'menu' || this.over;
    this.rig.update(dt, this.input, og.pos, this.world, orbit);
    this.world.update(dt, t, this.camera.position, og.pos);
    const cam = this.camera.position;
    const cd = Math.hypot(cam.x - og.pos.x, cam.z - og.pos.z) || 1;
    this.moonlight.position.set(og.pos.x + ((cam.x - og.pos.x) / cd) * 2.5, og.pos.y + 5, og.pos.z + ((cam.z - og.pos.z) / cd) * 2.5);

    if (playing || this.state === 'paused') this._updateHud(t);
    if (playing) {
      this._hints();
      if (this.planted >= this.total) this._win();
      else if (this.time >= M.seconds) this._timeUp();
    }
  }

  _director(dt) {
    const T = M.thief;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const max = Math.round(THREE.MathUtils.lerp(T.max[0], T.max[1], this.progress));
    const n = this.thieves.active.length;
    // esperam no escuro, mais a frente no caminho do ogro
    const ahead = { x: Math.sin(this.ogre.yaw), z: Math.cos(this.ogre.yaw) };
    if (n < max && this.thieves.spawn(this.ogre.pos, ahead) && !this.tutorial.shadow) {
      this.tutorial.shadow = true;
      this.later(1.5, () => this.hud.toast('As <b class="c-shadow">sombras</b> não entram na luz das flores… mas adoram roubar do balde!', 'warn', 4.5));
    }
    this.spawnT = this.thieves.active.length < max ? T.respawn : T.every * rand(0.8, 1.2);
  }

  // chegou no jardim da cabana: todas as flores do balde sao plantadas (e voam para os canteiros uma a uma)
  _plant() {
    const og = this.ogre;
    if (this.carried === 0 || Math.hypot(og.pos.x - M.cabin.x, og.pos.z - M.cabin.z) > M.garden) return;
    const n = this.carried;
    this.carried = 0;
    this.planted += n;
    for (let i = 0; i < n; i++) {
      this.later(i * M.plantEvery, () => {
        const f = this.flowers.plant(og.bucketWorld(this._v));
        this.sfx.plant(this.flowers.planted.length);
        const to = f.fly.to;
        this.later(0.5, () => {
          this.rings.spawn(to.x, to.z, 1.6, 0x9fe8ff, 0.6, to.y + 0.1);
          this.fx.add.burst(10, () => ({
            x: to.x, y: to.y + 0.6, z: to.z, vx: rand(-1, 1), vy: rand(1, 2.5), vz: rand(-1, 1),
            life: rand(0.5, 0.9), s0: 0.1, s1: 0, r: 1.2, g: 2.2, b: 2.6, a0: 1, a1: 0, drag: 2, grav: 1,
          }));
        });
      });
    }
    if (this.planted < this.total) {
      const left = this.total - this.planted;
      this.hud.toast(`${this.planted} flores no jardim! ${left === 1 ? 'Falta só 1.' : `Faltam ${left}.`}`, 'good', 2.4);
    }
  }

  _updateHud(t) {
    const hud = this.hud;
    hud.setGoal(this.planted / this.total, `${this.planted}/${this.total}`);
    hud.setClock(clockText(19 * 60 + this.progress * 180), this.progress);
    hud.setCarry(this.carried);
    hud.setRoar(this.roarCd, M.roar.cooldown);
    const m = this.map;
    m.cx = m.ogre.x = this.ogre.pos.x;
    m.cz = m.ogre.z = this.ogre.pos.z;
    m.yaw = this.rig.yaw;
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
      this.rings.spawn(o.x, o.z, R.radius * 0.7, 0x9fe8ff, 0.8, o.y + 0.1);
      const thieves = this.thieves.thieves.length;
      const n = this.thieves.roar(o.x, o.z, R.radius, (s) => this._onRecover(s));
      if (n > 0) this.sfx.shadowDie();
      if (n > 0 && thieves === this.thieves.thieves.length) {
        this.hud.toast(n > 1 ? `RUAAARGH! ${n} sombras fugiram!` : 'RUAAARGH! A sombra fugiu!', 'good', 1.8);
      }
    });
  }

  _onPick(f) {
    this.carried++;
    this.sfx.flower(this.carried);
    const p = f.root.position;
    this.fx.add.burst(14, () => ({
      x: p.x, y: p.y + 0.8, z: p.z, vx: rand(-1.5, 1.5), vy: rand(0.5, 3), vz: rand(-1.5, 1.5),
      life: rand(0.5, 0.9), s0: 0.12, s1: 0, r: 1.2, g: 2.2, b: 2.6, a0: 1, a1: 0, drag: 2, grav: 2,
    }));
    if (!this.tutorial.dark) {
      this.tutorial.dark = true;
      this.later(0.8, () => this.hud.toast('Sem a flor, aquele pedaço da trilha fica no escuro', '', 3.5));
    }
    if (this.carried >= M.bucket && this.once('full', 8)) this.hud.toast('Balde cheio! Leve as flores para a cabana', '', 2.6);
  }

  _onSteal(s) {
    const og = this.ogre;
    if (!this.playing || og.invuln > 0 || this.carried === 0) return false;
    this.carried--;
    this.stats.stolen++;
    og.hit(s.x, s.z);
    this.sfx.steal();
    this.hud.flash(0.8);
    this.rig.shake = Math.max(this.rig.shake, 0.4);
    if (this.once('stolen', 5)) this.hud.toast('Uma sombra roubou uma flor! Corra atrás dela!', 'warn', 2.6);
    return true;
  }

  // pegou a flor de volta da ladra: volta para o balde (ou cai no chao, se o balde estiver cheio)
  _onRecover(s) {
    this.stats.recovered++;
    const y = s.y + 0.55 * U;
    if (this.carried < M.bucket) this.carried++;
    else this.flowers.drop(s.x, y, s.z);
    this.sfx.recover();
    this.fx.add.burst(24, () => ({
      x: s.x, y, z: s.z, vx: rand(-3, 3), vy: rand(0.5, 4), vz: rand(-3, 3),
      life: rand(0.5, 1), s0: 0.14, s1: 0, r: 1.2, g: 2.2, b: 2.6, a0: 1, a1: 0, drag: 2.5, grav: 3,
    }));
    this.fx.norm.burst(14, () => ({
      x: s.x, y, z: s.z, vx: rand(-2, 2), vy: rand(0, 2), vz: rand(-2, 2),
      life: rand(0.6, 1), s0: 0.4, s1: 1.2, r: 0.1, g: 0.06, b: 0.14, a0: 0.5, a1: 0, drag: 2,
    }));
    this.hud.toast('Peguei de volta!', 'good', 1.6);
  }

  _onEscape(s) {
    this.flowers.drop(s.x, s.y + 0.55 * U, s.z);
    this.sfx.shadowDie();
    if (this.once('escape', 4)) this.hud.toast('A sombra largou a flor no mato. Procure no minimapa!', 'warn', 3);
  }

  _hints() {
    if (this.needsLockHint()) return;
    const o = this.ogre.pos;
    const thief = this.thieves.thieves[0];
    if (thief) {
      const d = Math.hypot(thief.x - o.x, thief.z - o.z);
      return this.hud.hint(d < M.roar.radius && this.roarCd <= 0
        ? 'Ruja <kbd>Espaço</kbd> para a sombra largar a flor!'
        : 'Corra atrás da sombra com a flor! <kbd>Shift</kbd>');
    }
    const near = this.thieves.active.some((s) => s.state === 'chase' && Math.hypot(s.x - o.x, s.z - o.z) < 6);
    if (near && this.roarCd <= 0) return this.hud.hint('Sombra chegando! <kbd>Espaço</kbd> rugir');
    if (this.carried >= M.bucket) return this.hud.hint('Balde cheio! Leve as flores para o jardim da cabana');
    if (this.carried > 0 && this.flowers.left === 0) return this.hud.hint('Leve as últimas flores para o jardim da cabana');
    this.hud.hint(null);
  }

  _drawMap(c, S, time) {
    const o = this.ogre.pos;
    c.strokeStyle = 'rgba(190,170,130,0.5)';
    c.lineWidth = 3;
    c.lineJoin = c.lineCap = 'round';
    c.beginPath();
    TRAIL.forEach(([x, z], i) => (i ? c.lineTo(x * S, z * S) : c.moveTo(x * S, z * S)));
    c.stroke();

    c.fillStyle = 'rgba(40,70,60,0.8)';
    for (const t of this.mapTrees) {
      if (Math.abs(t.x - o.x) > 45 || Math.abs(t.z - o.z) > 45) continue;
      c.beginPath();
      c.arc(t.x * S, t.z * S, Math.max(1.2, t.canopyR * 0.4 * S), 0, Math.PI * 2);
      c.fill();
    }
    // jardim e cabana, e o poste da clareira
    const cb = M.cabin;
    c.fillStyle = `rgba(140,220,255,${0.08 + 0.12 * (this.planted / this.total)})`;
    c.beginPath();
    c.arc(cb.x * S, cb.z * S, M.light.garden * S, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#c99a5b';
    c.fillRect(cb.x * S - 3.5 * S, cb.z * S - 3.5 * S, 7 * S, 7 * S);
    c.fillStyle = '#ffd27a';
    c.beginPath();
    c.arc(GLADE_LAMP.x * S, GLADE_LAMP.z * S, 2.5, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = '#9fe8ff';
    for (const s of this.flowers.spots) {
      if (s.taken) continue;
      c.beginPath();
      c.arc(s.x * S, s.z * S, 2.6, 0, Math.PI * 2);
      c.fill();
    }
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    for (const m of this.flowers.loose) {
      if (m.fly) continue;
      c.fillStyle = '#9fe8ff';
      c.beginPath();
      c.arc(m.x * S, m.z * S, 3, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = `rgba(159,232,255,${pulse})`;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(m.x * S, m.z * S, 5 + pulse * 2, 0, Math.PI * 2);
      c.stroke();
    }
    for (const s of this.thieves.list) {
      if (s.state === 'scared' || s.state === 'gone') continue;
      const flee = s.state === 'flee';
      c.fillStyle = flee ? (Math.floor(time * 8) % 2 ? '#9fe8ff' : '#b77dff') : s.state === 'chase' ? '#ff4a8a' : '#6b4a96';
      c.beginPath();
      c.arc(s.x * S, s.z * S, flee ? 4.2 : 3.4, 0, Math.PI * 2);
      c.fill();
    }

    // a cabana fora do mapa: uma setinha na borda apontando para ela
    const dx = cb.x - o.x, dz = cb.z - o.z, d = Math.hypot(dx, dz);
    const R = this.map.radius * 0.86;
    if (d > R) {
      const x = (o.x + (dx / d) * R) * S, z = (o.z + (dz / d) * R) * S;
      c.fillStyle = this.carried > 0 ? `rgba(255,210,122,${0.6 + 0.4 * pulse})` : 'rgba(201,154,91,0.9)';
      c.beginPath();
      c.arc(x, z, 5, 0, Math.PI * 2);
      c.fill();
    }
  }

  // ------------------------------------------------------------- fim

  _stats() {
    const left = Math.max(0, M.seconds - this.time);
    return [
      ['Flores no jardim', `${this.planted} de ${this.total}`],
      ['Tempo sobrando', `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`],
      ['Flores roubadas', this.stats.stolen],
      ['Pegas de volta', this.stats.recovered],
    ];
  }

  _end() {
    for (const s of this.thieves.list) {
      if (s.state === 'flee') this.thieves.vanish(s);
      else if (s.state !== 'scared' && s.state !== 'gone') this.thieves.scare(s, this.ogre.pos.x, this.ogre.pos.z);
    }
  }

  _win() {
    this._end();
    const c = M.cabin, y = this.world.heightAt(c.x, c.z);
    this.fx.add.burst(80, (i) => {
      const a = (i / 80) * Math.PI * 2, r = rand(5, 8);
      return {
        x: c.x + Math.cos(a) * r, y: y + 0.8, z: c.z + Math.sin(a) * r, vx: rand(-0.5, 0.5), vy: rand(2, 5), vz: rand(-0.5, 0.5),
        life: rand(1, 1.8), s0: 0.16, s1: 0, r: 1.2, g: 2.2, b: 2.6, a0: 1, a1: 0, drag: 1, grav: 1,
      };
    });
    this.finish({
      win: true,
      stars: starsFor({ complete: true, timeLeft: M.seconds - this.time, great: M.great }),
      title: 'A cabana está brilhando!',
      sub: 'Todas as flores-lua foram plantadas. Nenhuma sombra vai morar lá!',
      stats: this._stats(),
    }, 3);
  }

  _timeUp() {
    this._end();
    if (this.planted >= M.pass) {
      this.finish({
        win: true,
        stars: 1,
        title: 'A lua subiu!',
        sub: `${this.planted} flores no jardim: a cabana ficou iluminada.`,
        stats: this._stats(),
      }, 2.6);
    } else {
      this.finish({
        win: false,
        stars: 0,
        title: 'A cabana ficou no escuro…',
        sub: `Precisava de pelo menos ${M.pass} flores no jardim. Tente de novo!`,
        stats: this._stats(),
      }, 2.6);
    }
  }
}
