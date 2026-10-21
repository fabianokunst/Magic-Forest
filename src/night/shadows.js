import { CONFIG, DOOR } from './config.js';
import { ShadowLook } from '../core/shadow-look.js';

const MAX = 24;

// Sombras: nuvens escuras com olhos brilhantes. Fogem da luz, roubam vagalumes e drenam lanternas e a lareira.
export class Shadows {
  constructor(scene, fx, world, lanterns) {
    this.fx = fx;
    this.world = world;
    this.lanterns = lanterns;
    this.look = new ShadowLook(scene, MAX);
    this.list = [];
  }

  reset() {
    this.list.length = 0;
  }

  activeCount() {
    return this.list.filter((s) => s.state !== 'dying' && s.state !== 'flee').length;
  }

  spawn(big = false, angle = null) {
    if (this.list.length >= MAX) return null;
    const R = CONFIG.worldRadius;
    let x = 0, z = R;
    for (let i = 0; i < 16; i++) {
      const a = angle !== null ? angle + (Math.random() - 0.5) * 0.8 : Math.random() * Math.PI * 2;
      const r = R - 0.4 - Math.random() * 1.4;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      const clear = !this.world.trees.some((t) => Math.hypot(x - t.x, z - t.z) < t.col + 0.3);
      if (clear && this.lanterns.lightAt(x, z) === 0) break;
    }
    const s = {
      x, z, vx: 0, vz: 0, hp: big ? 3 : 1, big, scale: big ? 1.6 : 1,
      state: 'emerge', t: 0, alpha: 0, kind: 'door', target: null, retarget: 0,
      phase: Math.random() * 100, fx: -x, fz: -z, flash: 0, burn: 0, stun: 0, trail: 0,
      doorOff: (Math.random() - 0.5) * 1.2, attacking: false,
    };
    const l = Math.hypot(s.fx, s.fz) || 1;
    s.fx /= l;
    s.fz /= l;
    this.list.push(s);
    return s;
  }

  _chooseTarget(s, ctx) {
    const o = ctx.ogre;
    const dO = Math.hypot(o.x - s.x, o.z - s.z);
    const aggro = CONFIG.shadow.aggro + (o.carrying > 0 ? CONFIG.shadow.aggroCarry : 0);
    const ogreSafe = this.lanterns.lightAt(o.x, o.z) > 0.35 ||
      Math.hypot(o.x, o.z) < this.world.houseLightRadius(ctx.hearth) * 0.8;
    if (dO < aggro && !ogreSafe) {
      s.kind = 'ogre';
      s.target = null;
      return;
    }
    // as pequenas atacam lanternas pelo caminho; as grandes vao direto para a casa
    const reach = s.big ? 3 : 7.5;
    if (s.kind === 'lantern' && s.target && s.target.fuel > 0.01 &&
        Math.hypot(s.target.postX - s.x, s.target.postZ - s.z) < reach + 2) return;
    let best = null, bd = reach;
    for (const l of this.lanterns.list) {
      if (l.fuel <= 0.01) continue;
      const d = Math.hypot(l.postX - s.x, l.postZ - s.z);
      if (d < bd) { bd = d; best = l; }
    }
    if (best) {
      s.kind = 'lantern';
      s.target = best;
    } else {
      s.kind = 'door';
      s.target = null;
    }
  }

  kill(s, cause, ctx) {
    if (s.state === 'dying') return;
    s.state = 'dying';
    s.t = 0;
    const sc = s.scale;
    this.fx.norm.burst(14 * sc, () => ({
      x: s.x, y: 0.4 * sc, z: s.z,
      vx: (Math.random() - 0.5) * 2.2, vy: Math.random() * 1.6, vz: (Math.random() - 0.5) * 2.2,
      life: 0.9 + Math.random() * 0.6, s0: 0.35 * sc, s1: 0.05, r: 0.05, g: 0.02, b: 0.08, a0: 0.8, a1: 0, drag: 2.5,
    }));
    this.fx.add.burst(18 * sc, () => ({
      x: s.x, y: 0.45 * sc, z: s.z,
      vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 4,
      life: 0.5 + Math.random() * 0.5, s0: 0.06, s1: 0.0, r: 1.4, g: 0.4, b: 2.2, a0: 1, a1: 0, drag: 3, grav: 2,
    }));
    if (ctx) ctx.onDie(s, cause);
  }

  damage(s, amount, ctx, fromX, fromZ) {
    if (s.state === 'dying' || s.state === 'flee') return;
    s.hp -= amount;
    s.flash = 1;
    if (fromX !== undefined) {
      const dx = s.x - fromX, dz = s.z - fromZ, d = Math.hypot(dx, dz) || 1;
      s.vx += (dx / d) * 2.5;
      s.vz += (dz / d) * 2.5;
    }
    if (s.hp <= 0) this.kill(s, 'apple', ctx);
  }

  roar(x, z, radius, ctx) {
    let n = 0;
    for (const s of this.list) {
      if (s.state === 'dying' || s.state === 'flee') continue;
      const dx = s.x - x, dz = s.z - z, d = Math.hypot(dx, dz) || 1e-3;
      if (d < radius + 0.3 * s.scale) {
        if (s.big && s.hp > 2) {
          s.hp -= 2;
          s.flash = 1;
          s.vx += (dx / d) * 5;
          s.vz += (dz / d) * 5;
          s.stun = 1.5;
        } else {
          this.kill(s, 'roar', ctx);
          n++;
        }
      } else if (d < radius * 2) {
        s.vx += (dx / d) * 3.5;
        s.vz += (dz / d) * 3.5;
        s.stun = 1.2;
      }
    }
    return n;
  }

  // mira assistida: a sombra mais alinhada com a direcao da camera
  pickTarget(ox, oz, dx, dz, range) {
    let best = null, bs = -Infinity;
    for (const s of this.list) {
      if (s.state === 'dying' || s.state === 'flee') continue;
      const vx = s.x - ox, vz = s.z - oz, d = Math.hypot(vx, vz);
      if (d > range || d < 0.05) continue;
      const dot = (vx * dx + vz * dz) / d;
      if (dot < 0.55) continue;
      const score = dot - (d / range) * 0.45;
      if (score > bs) { bs = score; best = s; }
    }
    return best;
  }

  update(dt, time, ctx) {
    const C = CONFIG.shadow;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt;
      s.flash = Math.max(0, s.flash - dt * 4);
      s.burn = Math.max(0, s.burn - dt * 3);
      s.attacking = false;

      if (s.state === 'dying') {
        if (s.t > 0.6) this.list.splice(i, 1);
        continue;
      }
      if (s.state === 'flee') {
        s.alpha = Math.max(0, 1 - s.t / 2.2);
        const d = Math.hypot(s.x, s.z) || 1;
        s.vx += ((s.x / d) * C.speed * 1.7 - s.vx) * dt * 3;
        s.vz += ((s.z / d) * C.speed * 1.7 - s.vz) * dt * 3;
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        if (s.t > 2.2) this.list.splice(i, 1);
        continue;
      }
      if (s.state === 'emerge') {
        s.alpha = Math.min(1, s.t / 1.2);
        if (s.t > 1.2) { s.state = 'seek'; s.t = 0; }
        continue;
      }

      // a luz queima
      const light = this.lanterns.lightAt(s.x, s.z);
      let dmg = light * CONFIG.lantern.lightDps;
      const hr = this.world.houseLightRadius(ctx.hearth);
      const dh = Math.hypot(s.x, s.z);
      if (dh < hr) dmg += CONFIG.hearth.lightDps * ctx.hearth * (1 - 0.5 * dh / hr);
      if (dmg > 0) {
        s.hp -= dmg * dt * (s.big ? 0.6 : 1);
        s.burn = 1;
        if (Math.random() < dt * 14) {
          this.fx.norm.emit({
            x: s.x + (Math.random() - 0.5) * 0.3, y: 0.5 * s.scale, z: s.z + (Math.random() - 0.5) * 0.3,
            vy: 0.6 + Math.random() * 0.4, life: 1.2, s0: 0.2, s1: 0.45, r: 0.06, g: 0.05, b: 0.07, a0: 0.5, a1: 0, drag: 1,
          });
        }
        if (Math.random() < dt * 10) {
          this.fx.add.emit({
            x: s.x + (Math.random() - 0.5) * 0.3, y: 0.4 * s.scale, z: s.z + (Math.random() - 0.5) * 0.3,
            vx: (Math.random() - 0.5), vy: 1 + Math.random(), vz: (Math.random() - 0.5),
            life: 0.6, s0: 0.05, s1: 0, r: 2.2, g: 0.9, b: 0.3, a0: 1, a1: 0, drag: 1.5,
          });
        }
        if (s.hp <= 0) {
          this.kill(s, 'light', ctx);
          continue;
        }
      }

      s.retarget -= dt;
      if (s.retarget <= 0) {
        this._chooseTarget(s, ctx);
        s.retarget = 0.6 + Math.random() * 0.4;
      }
      let tx, tz;
      if (s.kind === 'ogre') { tx = ctx.ogre.x; tz = ctx.ogre.z; }
      else if (s.kind === 'lantern') { tx = s.target.postX; tz = s.target.postZ; }
      else { tx = DOOR.x + s.doorOff; tz = DOOR.z + 0.35; }
      let dx = tx - s.x, dz = tz - s.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      dx /= dist;
      dz /= dist;

      // separacao entre sombras e desvio das arvores
      for (const o of this.list) {
        if (o === s || o.state === 'dying') continue;
        const ox = s.x - o.x, oz = s.z - o.z, od = Math.hypot(ox, oz);
        if (od < 0.7 && od > 1e-4) {
          dx += (ox / od) * (0.7 - od) * 2;
          dz += (oz / od) * (0.7 - od) * 2;
        }
      }
      for (const t of this.world.trees) {
        const ox = s.x - t.x, oz = s.z - t.z, od = Math.hypot(ox, oz);
        const rr = t.col + 0.4;
        if (od < rr + 0.7 && od > 1e-4) {
          const push = (rr + 0.7 - od) / 0.7;
          dx += (ox / od) * push * 1.2 + (-oz / od) * push * 0.6;
          dz += (oz / od) * push * 1.2 + (ox / od) * push * 0.6;
        }
      }
      if (s.kind !== 'door' && this.world.insideHouse(s.x, s.z, 0.6)) {
        dx += Math.sign(s.x) * 1.5;
        dz += Math.sign(s.z) * 1.5;
      }
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl;
      dz /= dl;

      let speed = C.speed * (s.big ? 0.72 : 1) * (1 + ctx.progress * 0.3) * (light > 0 ? 0.55 : 1);
      if (s.stun > 0) {
        s.stun -= dt;
        speed *= 0.15;
      }
      if (s.kind !== 'ogre' && dist < 0.5) speed = 0;
      const k = Math.min(1, dt * 3);
      s.vx += (dx * speed - s.vx) * k;
      s.vz += (dz * speed - s.vz) * k;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      if (this.world.insideHouse(s.x, s.z, 0.2)) {
        const h = 0.97 + 0.2;
        if (h - Math.abs(s.x) < h - Math.abs(s.z)) s.x = Math.sign(s.x || 1) * h;
        else s.z = Math.sign(s.z || 1) * h;
      }
      const sp = Math.hypot(s.vx, s.vz);
      if (sp > 0.05) {
        s.fx += (s.vx / sp - s.fx) * Math.min(1, dt * 6);
        s.fz += (s.vz / sp - s.fz) * Math.min(1, dt * 6);
      }

      // efeito no alvo
      if (s.kind === 'ogre') {
        const d = Math.hypot(ctx.ogre.x - s.x, ctx.ogre.z - s.z);
        if (d < C.hitRadius * s.scale && ctx.onSteal(s)) {
          s.state = 'flee';
          s.t = 0;
        }
      } else if (s.kind === 'lantern' && dist < 0.75) {
        s.attacking = true;
        if (this.lanterns.drain(s.target, CONFIG.lantern.drainByShadow * dt * (s.big ? 1.6 : 1))) {
          ctx.onLanternOut(s.target);
          s.retarget = 0;
        }
      } else if (s.kind === 'door' && dist < 0.75) {
        s.attacking = true;
        ctx.onHouse(s, dt);
      }

      s.trail -= dt;
      if (s.trail <= 0) {
        s.trail = 0.09;
        this.fx.norm.emit({
          x: s.x - s.fx * 0.15, y: 0.3 * s.scale + Math.random() * 0.3, z: s.z - s.fz * 0.15,
          vy: 0.25, life: 1.1, s0: 0.28 * s.scale, s1: 0.06, r: 0.04, g: 0.02, b: 0.07, a0: 0.45, a1: 0, drag: 1,
        });
      }
    }
    this.look.draw(this.list, time, ctx.camPos);
  }
}
