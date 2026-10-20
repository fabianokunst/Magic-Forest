import * as THREE from 'three';
import { CONFIG, DOOR, HOUSE } from './config.js';
import { World } from './world.js';
import { Lanterns } from './lanterns.js';
import { Fireflies } from './fireflies.js';
import { Shadows } from './shadows.js';
import { Apples } from './apples.js';
import { Ogre } from './ogre.js';
import { CameraRig } from './camera.js';
import { ParticlePool, Rings } from './fx.js';

const CARDINAL = [
  { name: 'leste', a: 0 },
  { name: 'sul', a: Math.PI / 2 },
  { name: 'oeste', a: Math.PI },
  { name: 'norte', a: -Math.PI / 2 },
];
const rand = (a, b) => a + Math.random() * (b - a);

export class Game {
  constructor({ scene, camera, assets, hud, sfx, input }) {
    Object.assign(this, { scene, camera, hud, sfx, input });
    this.world = new World(scene, assets);
    this.fx = {
      add: new ParticlePool(scene, 1400, THREE.AdditiveBlending, 1.5),
      norm: new ParticlePool(scene, 1000, THREE.NormalBlending, 1.0),
    };
    this.fx.norm.buf.points.renderOrder = 1;
    this.fx.add.buf.points.renderOrder = 3;
    this.rings = new Rings(scene);
    this.lanterns = new Lanterns(scene, this.world);
    this.fireflies = new Fireflies(scene, this.world);
    this.shadows = new Shadows(scene, this.fx, this.world, this.lanterns);
    this.apples = new Apples(scene, this.fx, this.world);
    this.ogre = new Ogre(assets.ogre, scene);
    this.rig = new CameraRig(camera);
    this.spawnPoint = assets.level.ogre.spawn;
    this.clock = 0;
    this.state = 'menu';
    this._v = new THREE.Vector3();

    this.shadowCtx = {
      ogre: { x: 0, z: 0, carrying: 0 },
      hearth: 1,
      progress: 0,
      camPos: camera.position,
      onSteal: (s) => this._onSteal(s),
      onHouse: (s, dt) => this._onHouse(s, dt),
      onLanternOut: (l) => this._onLanternOut(l),
      onDie: (s, cause) => this._onShadowDie(s, cause),
    };
    this.reset();
  }

  reset() {
    this.time = 0;
    this.progress = 0;
    this.dawn = 0;
    this.hearth = CONFIG.hearth.start;
    this.carried = 0;
    this.appleCount = CONFIG.apples.start;
    this.roarCd = 0;
    this.throwCd = 0;
    this.stats = { delivered: 0, banished: 0, thrown: 0, lit: 0, roars: 0, hits: 0 };
    this.pending = [];
    this.cooldowns = {};
    this.tutorial = {};
    this.spawnTimer = 3;
    this.waves = [0.3, 0.55, 0.8];
    this.houseAttacked = 0;
    this.smokeT = 0;
    this.moveDir = { x: 0, z: 0 };
    this.wantRun = false;
    this.ogre.place(this.spawnPoint[0], this.spawnPoint[2], Math.PI);
    this.ogre.setMode('play');
    this.rig.yaw = 0;
    this.rig.pitch = 0.28;
    this.rig.snap(this.ogre.pos);
    for (const t of this.world.trees) t.cooldown = 0;
    this.lanterns.reset();
    this.fireflies.reset();
    this.shadows.reset();
    this.apples.reset();
    this.fx.add.clear();
    this.fx.norm.clear();
    this.hud.clearToasts();
  }

  start() {
    this.state = 'playing';
    this.sfx.start();
    this.later(0.6, () => this.hud.toast('Junte os <b class="c-fire">vagalumes</b> que brilham pela floresta', '', 4));
    this.later(5, () => {
      if (!this.tutorial.delivered) this.hud.toast('Leve-os até a <b class="c-hearth">porta de casa</b> para alimentar a lareira', '', 4.5);
    });
  }

  pause() {
    if (this.state === 'playing') this.state = 'paused';
  }

  resume() {
    if (this.state === 'paused') this.state = 'playing';
  }

  later(t, fn) {
    this.pending.push({ t, fn });
  }

  // limita a repeticao de avisos
  once(key, cooldown) {
    if ((this.cooldowns[key] ?? -Infinity) > this.clock) return false;
    this.cooldowns[key] = this.clock + cooldown;
    return true;
  }

  update(dt) {
    this.clock += dt;
    const playing = this.state === 'playing';
    const t = this.clock;

    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        p.fn();
      }
    }

    if (playing) {
      this.time += dt;
      this.progress = Math.min(1, this.time / CONFIG.nightSeconds);
      this.dawn = THREE.MathUtils.smoothstep(this.progress, 0.86, 1);
      this.hearth -= CONFIG.hearth.drain * dt;
      this.roarCd = Math.max(0, this.roarCd - dt);
      this.throwCd = Math.max(0, this.throwCd - dt);
      this.houseAttacked = Math.max(0, this.houseAttacked - dt);
      this._controls();
      this._director(dt);
    } else {
      this.moveDir.x = this.moveDir.z = 0;
      this.wantRun = false;
    }

    const og = this.ogre;
    og.update(dt, this.moveDir, this.wantRun, this.world);
    og.updateBucket(t, this.carried, this.appleCount);

    for (const ev of this.lanterns.update(dt, t, playing)) {
      if (ev.type === 'out') this._onLanternOut(ev.lantern);
    }

    const catcher = og.bucketWorld(this._v);
    this.fireflies.update(dt, t, {
      spawn: this.state !== 'won' && this.state !== 'lost',
      catcher,
      canCatch: playing && og.mode === 'play' && og.invuln <= 0 && this.carried < CONFIG.bucketCapacity,
      onCatch: (f) => this._onCatch(f),
    });

    const sc = this.shadowCtx;
    sc.ogre.x = og.pos.x;
    sc.ogre.z = og.pos.z;
    sc.ogre.carrying = this.carried;
    sc.hearth = Math.max(0, this.hearth);
    sc.progress = this.progress;
    this.shadows.update(dt, t, sc);

    this.apples.update(dt, t, {
      shadows: this.shadows,
      ogre: og.pos,
      canPickup: playing && this.appleCount < CONFIG.apples.max,
      onHit: (s, p) => this._onAppleHit(s, p),
      onPickup: () => {
        this.appleCount++;
        this.sfx.pop();
      },
    });

    if (playing) this._deliverAtDoor();
    this._smoke(dt);
    this.fx.add.update(dt);
    this.fx.norm.update(dt);
    this.rings.update(dt);
    this.world.update(dt, t, this.dawn, Math.max(0, this.hearth), og.pos);

    const orbit = this.state === 'menu' || this.state === 'won' || this.state === 'lost';
    this.rig.update(dt, this.input, og.pos, this.world, orbit);

    if (playing || this.state === 'paused') {
      this.hud.update(this, dt);
      this.hud.minimap(this, t);
      if (playing) this._hints();
    }

    if (playing) {
      if (this.hearth <= 0) this._lose();
      else if (this.progress >= 1) this._win();
    }
  }

  // ------------------------------------------------------------- controles

  _controls() {
    const inp = this.input;
    const a = inp.axis();
    const f = this.rig.forward();
    this.moveDir.x = -f.z * a.x + f.x * a.y;
    this.moveDir.z = f.x * a.x + f.z * a.y;
    this.wantRun = inp.down('ShiftLeft', 'ShiftRight');
    if (inp.hit('Space')) this._roar();
    if ((inp.clicked && inp.locked) || inp.hit('KeyF')) this._throw();
    if (inp.hit('KeyE')) this._interact();
  }

  _roar() {
    const og = this.ogre;
    if (this.roarCd > 0 || og.busy || og.mode !== 'play') return;
    this.roarCd = CONFIG.roar.cooldown;
    this.stats.roars++;
    og.playOneShot('Roar', { lock: CONFIG.roar.lock, fadeIn: 0.08, fadeOut: 0.25 });
    this.sfx.roar();
    this.later(0.22, () => {
      const o = og.pos;
      this.rig.shake = Math.max(this.rig.shake, 0.65);
      this.rings.spawn(o.x, o.z, CONFIG.roar.radius, 0xffc46b, 0.55);
      this.rings.spawn(o.x, o.z, CONFIG.roar.radius * 0.7, 0xb77dff, 0.8);
      this.fx.norm.burst(26, (i) => {
        const ang = (i / 26) * Math.PI * 2;
        return {
          x: o.x, y: 0.08, z: o.z, vx: Math.cos(ang) * rand(2.5, 4), vy: rand(0.2, 0.8), vz: Math.sin(ang) * rand(2.5, 4),
          life: rand(0.6, 1), s0: 0.12, s1: 0.45, r: 0.22, g: 0.18, b: 0.14, a0: 0.4, a1: 0, drag: 3.5,
        };
      });
      const n = this.shadows.roar(o.x, o.z, CONFIG.roar.radius, this.shadowCtx);
      if (n >= 2) this.hud.toast(`RUAAARGH! ${n} sombras espantadas!`, 'good', 2);
    });
  }

  _throw() {
    const og = this.ogre;
    if (this.throwCd > 0 || og.busy || og.mode !== 'play') return;
    if (this.appleCount <= 0) {
      if (this.once('noapple', 2)) {
        this.sfx.denied();
        this.hud.toast('Sem maçãs! Sacuda uma macieira com <kbd>E</kbd>', 'warn', 2.5);
      }
      return;
    }
    this.appleCount--;
    this.throwCd = CONFIG.apples.throwCooldown;
    this.stats.thrown++;
    const f = this.rig.forward();
    const target = this.shadows.pickTarget(og.pos.x, og.pos.z, f.x, f.z, CONFIG.apples.range);
    const dir = target ? { x: target.x - og.pos.x, z: target.z - og.pos.z } : f;
    og.faceToward(dir.x, dir.z, 0.45);
    og.playOneShot('ThrowUpper', { masked: true, fadeIn: 0.06, fadeOut: 0.25 });
    this.later(0.2, () => {
      const from = og.handWorld(new THREE.Vector3());
      from.y = Math.max(from.y, og.pos.y + 0.55);
      let to;
      if (target && target.state !== 'dying' && target.state !== 'flee') {
        const T = Math.hypot(target.x - from.x, target.z - from.z) / CONFIG.apples.speed;
        to = new THREE.Vector3(target.x + target.vx * T, 0.42 * target.scale, target.z + target.vz * T);
      } else {
        const l = Math.hypot(dir.x, dir.z) || 1;
        to = new THREE.Vector3(og.pos.x + (dir.x / l) * 7, 0.05, og.pos.z + (dir.z / l) * 7);
      }
      this.apples.launch(from, to);
      this.sfx.throwApple();
    });
  }

  _interact() {
    const og = this.ogre;
    if (og.busy || og.mode !== 'play') return;
    const o = og.pos;
    const l = this.lanterns.nearest(o.x, o.z, CONFIG.lantern.reach);
    if (l) {
      if (l.fuel > 0.97) {
        this.hud.toast('Esta lanterna já está bem acesa', '', 1.8);
        return;
      }
      if (this.carried === 0) {
        this.sfx.denied();
        this.hud.toast('Traga <b class="c-fire">vagalumes</b> para acender a lanterna', 'warn', 2);
        return;
      }
      const wasOut = l.fuel <= 0.01;
      const used = this.lanterns.feed(l, this.carried);
      this.carried -= used;
      og.faceToward(l.x - o.x, l.z - o.z, 0.6);
      og.playOneShot('Interact', { lock: 0.45 });
      const from = og.bucketWorld(new THREE.Vector3());
      this.later(0.25, () => {
        this.fx.add.burst(10 + used * 3, () => ({
          x: from.x, y: from.y, z: from.z,
          vx: (l.head.x - from.x) * rand(2, 3), vy: (l.head.y - from.y) * rand(2, 3) + rand(-0.5, 0.5), vz: (l.head.z - from.z) * rand(2, 3),
          life: 0.4, s0: 0.06, s1: 0.02, r: 0.6, g: 2.4, b: 1, a0: 1, a1: 0.2, drag: 0.5,
        }));
        this.fx.add.burst(22, () => ({
          x: l.head.x, y: l.head.y, z: l.head.z,
          vx: rand(-1.5, 1.5), vy: rand(-0.5, 2), vz: rand(-1.5, 1.5),
          life: rand(0.5, 1), s0: 0.06, s1: 0, r: 2.4, g: 1.3, b: 0.4, a0: 1, a1: 0, drag: 2, grav: 1.5,
        }));
        this.rings.spawn(l.x, l.z, this.lanterns.radius(l), 0xffb35a, 0.7);
        this.sfx.lantern();
      });
      if (wasOut) {
        this.stats.lit++;
        if (!this.tutorial.lantern) {
          this.tutorial.lantern = true;
          this.hud.toast('Lanterna acesa! A luz queima as sombras que chegam perto.', 'good', 3);
        } else {
          this.hud.toast('Lanterna acesa!', 'good', 1.6);
        }
      }
      return;
    }
    const tree = this.world.nearestTree(o.x, o.z, CONFIG.tree.reach);
    if (tree) {
      if (tree.cooldown > 0) {
        this.hud.toast(`Esta macieira está sem maçãs (${Math.ceil(tree.cooldown)}s)`, '', 1.8);
        return;
      }
      og.faceToward(tree.x - o.x, tree.z - o.z, 0.7);
      og.playOneShot('Interact', { lock: 0.6 });
      this.later(0.3, () => this._shakeTree(tree));
    }
  }

  _shakeTree(t) {
    this.world.shakeTree(t);
    this.sfx.shake();
    this.rig.shake = Math.max(this.rig.shake, 0.18);
    const o = this.ogre.pos;
    const toOgre = Math.atan2(o.z - t.z, o.x - t.x);
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = toOgre + rand(-0.9, 0.9);
      const d = t.col + rand(0.3, 1.1);
      this.apples.drop(t.x + Math.cos(a) * d, rand(2.2, 3.2), t.z + Math.sin(a) * d, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
    }
    this.fx.norm.burst(22, () => {
      const a = rand(0, Math.PI * 2), d = rand(0.3, 1.8);
      return {
        x: t.x + Math.cos(a) * d, y: rand(2, 3.6), z: t.z + Math.sin(a) * d,
        vx: rand(-0.4, 0.4), vy: rand(-0.6, -0.2), vz: rand(-0.4, 0.4),
        life: rand(2, 3), s0: 0.08, s1: 0.06, r: rand(0.25, 0.45), g: 0.07, b: 0.03, a0: 1, a1: 0, drag: 1.2, grav: 0.15,
      };
    });
  }

  _deliverAtDoor() {
    if (this.carried <= 0) return;
    const o = this.ogre.pos;
    if (Math.hypot(o.x - DOOR.x, o.z - DOOR.z) > DOOR.r) return;
    const n = this.carried;
    this.carried = 0;
    const before = this.hearth;
    this.hearth = Math.min(1, this.hearth + n * CONFIG.hearth.perFirefly);
    this.stats.delivered += n;
    this.sfx.deliver(n);
    const from = this.ogre.bucketWorld(new THREE.Vector3());
    this.fx.add.burst(8 + n * 3, () => ({
      x: from.x, y: from.y, z: from.z,
      vx: rand(-0.6, 0.6), vy: rand(0.6, 1.6), vz: (0.4 - from.z) * rand(1.5, 2.5),
      life: 0.6, s0: 0.06, s1: 0.01, r: 0.6, g: 2.4, b: 1, a0: 1, a1: 0, drag: 0.8,
    }));
    this.fx.add.burst(26, () => ({
      x: rand(-0.4, 0.4), y: rand(0.3, 1.2), z: 0.95,
      vx: rand(-0.8, 0.8), vy: rand(0.3, 1.5), vz: rand(0, 0.8),
      life: rand(0.6, 1.1), s0: 0.06, s1: 0, r: 2.4, g: 1.1, b: 0.3, a0: 1, a1: 0, drag: 1.5,
    }));
    this.hud.toast(`+${Math.round((this.hearth - before) * 100)}% na lareira`, 'good', 1.8);
    if (!this.tutorial.delivered) {
      this.tutorial.delivered = true;
      this.later(2, () => this.hud.toast('Vagalumes também acendem as <b>lanternas</b> da floresta: chegue perto e aperte <kbd>E</kbd>', '', 5));
    }
  }

  // ------------------------------------------------------------- eventos

  _onCatch(f) {
    this.carried++;
    this.sfx.pickup(this.carried);
    this.fx.add.burst(6, () => ({
      x: f.x, y: f.y, z: f.z, vx: rand(-0.6, 0.6), vy: rand(-0.2, 0.8), vz: rand(-0.6, 0.6),
      life: 0.4, s0: 0.05, s1: 0, r: 0.6, g: 2.4, b: 1, a0: 1, a1: 0, drag: 2,
    }));
    if (this.carried >= CONFIG.bucketCapacity && this.once('full', 20)) {
      this.hud.toast('Balde cheio! Leve à lareira ou a uma lanterna', '', 2.5);
    }
  }

  _onSteal(s) {
    if (this.ogre.invuln > 0 || this.state !== 'playing') return false;
    const o = this.ogre.pos;
    if (this.carried > 0) {
      const n = Math.min(3, this.carried);
      this.carried -= n;
      const b = this.ogre.bucketWorld(new THREE.Vector3());
      this.fireflies.scatter(b.x, b.y, b.z, n);
      this.hud.toast(`Uma sombra derrubou ${n} vagalume${n > 1 ? 's' : ''}!`, 'warn', 2.2);
      this.sfx.steal();
    } else if (this.appleCount > 0) {
      this.appleCount--;
      this.apples.drop(o.x, 0.6, o.z, rand(-1.5, 1.5), 2, rand(-1.5, 1.5));
      this.sfx.hurt();
    } else {
      this.sfx.hurt();
    }
    this.ogre.hit(s.x, s.z);
    this.hud.flash(0.9);
    this.rig.shake = Math.max(this.rig.shake, 0.4);
    this.stats.hits++;
    return true;
  }

  _onHouse(s, dt) {
    this.hearth -= CONFIG.hearth.attackDrain * dt * (s.big ? 1.8 : 1);
    this.houseAttacked = 0.3;
    if (Math.random() < dt * 6) {
      this.fx.norm.emit({
        x: s.x + rand(-0.2, 0.2), y: rand(0.2, 0.8), z: s.z - 0.2,
        vx: -s.x * 0.5, vy: 0.2, vz: (HOUSE.half - s.z) * 0.8,
        life: 0.8, s0: 0.15, s1: 0.04, r: 0.08, g: 0.02, b: 0.14, a0: 0.7, a1: 0, drag: 1,
      });
    }
    if (this.once('house', 9)) {
      this.hud.toast('As sombras estão na <b class="c-hearth">porta de casa</b>!', 'warn', 2.8);
      this.sfx.warn();
    }
  }

  _onLanternOut(l) {
    if (this.state !== 'playing') return;
    this.fx.norm.burst(10, () => ({
      x: l.head.x, y: l.head.y, z: l.head.z, vy: rand(0.3, 0.8), vx: rand(-0.2, 0.2), vz: rand(-0.2, 0.2),
      life: 1.4, s0: 0.1, s1: 0.4, r: 0.15, g: 0.15, b: 0.17, a0: 0.6, a1: 0, drag: 1,
    }));
    if (this.once('lanternOut', 4)) {
      this.hud.toast('Uma lanterna se apagou', 'warn', 2);
      this.sfx.lanternOut();
    }
  }

  _onShadowDie(s, cause) {
    this.stats.banished++;
    const n = s.big ? 3 : 1;
    for (let i = 0; i < n; i++) this.fireflies.spawnAt(s.x + rand(-0.2, 0.2), 0.5, s.z + rand(-0.2, 0.2));
    if (this.once('die', 0.08)) this.sfx.shadowDie();
  }

  _onAppleHit(s, p) {
    this.sfx.appleHit();
    this.shadows.damage(s, 1, this.shadowCtx, this.ogre.pos.x, this.ogre.pos.z);
  }

  // ------------------------------------------------------------- ritmo da noite

  _director(dt) {
    const p = this.progress;
    if (this.time < CONFIG.graceSeconds || p > 0.93) return;
    if (!this.tutorial.shadows) {
      this.tutorial.shadows = true;
      this.hud.toast('As <b class="c-shadow">Sombras</b> chegaram! <kbd>Clique</kbd> para jogar maçãs, <kbd>Espaço</kbd> para rugir', 'warn', 5);
      this.sfx.warn();
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const maxAlive = Math.round(2 + 8 * p);
      if (this.shadows.activeCount() < maxAlive) {
        this.shadows.spawn(p > 0.35 && Math.random() < (p - 0.3) * 0.7);
      }
      this.spawnTimer = THREE.MathUtils.lerp(9, 3, Math.pow(p, 0.85)) * rand(0.7, 1.3);
    }
    if (this.waves.length && p >= this.waves[0]) {
      const w = this.waves.shift();
      const dir = CARDINAL[Math.floor(Math.random() * 4)];
      const count = w < 0.4 ? 3 : w < 0.7 ? 5 : 7;
      for (let i = 0; i < count; i++) this.shadows.spawn(w > 0.5 && i === 0, dir.a);
      this.hud.toast(`Uma onda de sombras vem do <b>${dir.name}</b>!`, 'warn', 3.5);
      this.sfx.warn();
    }
    if (p > 0.75 && !this.tutorial.dawnSoon) {
      this.tutorial.dawnSoon = true;
      this.hud.toast('Falta pouco para o amanhecer!', '', 3);
    }
    if (this.hearth < 0.25 && this.once('lowHearth', 18)) {
      this.hud.toast('A lareira está fraca! Traga vagalumes para casa', 'warn', 3);
    }
  }

  _smoke(dt) {
    this.smokeT -= dt;
    if (this.smokeT > 0) return;
    const h = Math.max(0, this.hearth);
    this.smokeT = 0.18 / (0.25 + h);
    const [x, y, z] = HOUSE.smoke;
    this.fx.norm.emit({
      x: x + rand(-0.03, 0.03), y, z: z + rand(-0.03, 0.03),
      vx: rand(0.02, 0.12), vy: rand(0.3, 0.45), vz: rand(-0.05, 0.05),
      life: rand(3.5, 5), s0: 0.18, s1: 1.1, r: 0.16, g: 0.16, b: 0.2, a0: 0.12 + 0.25 * h, a1: 0, drag: 0.3,
    });
  }

  _hints() {
    if (!this.input.locked) return this.hud.hint('Clique na tela para controlar a câmera');
    const o = this.ogre.pos;
    const l = this.lanterns.nearest(o.x, o.z, CONFIG.lantern.reach);
    if (l) {
      if (l.fuel > 0.97) return this.hud.hint('Lanterna bem acesa');
      return this.hud.hint(this.carried > 0
        ? '<kbd>E</kbd> acender a lanterna com vagalumes'
        : 'Lanterna fraca: traga vagalumes');
    }
    const t = this.world.nearestTree(o.x, o.z, CONFIG.tree.reach);
    if (t) {
      return this.hud.hint(t.cooldown > 0
        ? `Macieira sem maçãs (${Math.ceil(t.cooldown)}s)`
        : '<kbd>E</kbd> sacudir a macieira');
    }
    if (this.carried === 0 && Math.hypot(o.x - DOOR.x, o.z - DOOR.z) < 1.6) {
      return this.hud.hint('Porta de casa: traga vagalumes para a lareira');
    }
    if (this.carried >= CONFIG.bucketCapacity) return this.hud.hint('Balde cheio! Leve à lareira ou a uma lanterna');
    this.hud.hint(null);
  }

  // ------------------------------------------------------------- fim

  _endStats() {
    const mins = 20 * 60 + Math.floor(this.progress * 600);
    return {
      ...this.stats,
      hearth: this.hearth,
      clock: `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`,
    };
  }

  _win() {
    this.state = 'won';
    this.input.releaseLock();
    this.hud.hint(null);
    for (const s of this.shadows.list) this.shadows.kill(s, 'dawn', null);
    this.ogre.setMode('celebrate');
    this.sfx.win();
    const moons = this.hearth > 0.6 ? 3 : this.hearth > 0.3 ? 2 : 1;
    const stats = this._endStats();
    this.later(2.4, () => this.hud.showEnd(true, stats, moons));
  }

  _lose() {
    this.state = 'lost';
    this.hearth = 0;
    this.input.releaseLock();
    this.hud.hint(null);
    this.ogre.setMode('sad');
    this.sfx.lose();
    const stats = this._endStats();
    this.later(2.6, () => this.hud.showEnd(false, stats, 0));
  }
}
