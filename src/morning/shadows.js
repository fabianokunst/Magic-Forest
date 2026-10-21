import { ShadowLook, SHADOW_DIE_TIME } from '../core/shadow-look.js';
import { MORNING } from './config.js';

const C = MORNING.shadow;

// Sombras de dia: escondidas na sombra das arvores. Quando o ogro chega perto, pulam para a sombra
// de outra arvore (escolhendo um caminho com pouco sol). No sol elas queimam e, se demorarem, viram borboletas.
export class DayShadows {
  constructor(parent, world, shade, fx) {
    this.world = world;
    this.shade = shade;
    this.fx = fx;
    this.look = new ShadowLook(parent, 16, C.unit);
    this.list = [];
    this.bound = { x: MORNING.center.x, z: MORNING.center.z, r: MORNING.radius - 2 };
  }

  reset(spots) {
    this.list = spots.map(([x, z]) => ({
      x, z, y: this.world.heightAt(x, z), vx: 0, vz: 0, scale: 1, alpha: 1,
      phase: Math.random() * 100, fx: 0, fz: 1, flash: 0, burn: 0, sun: 0, eyes: 1, shiver: 0,
      state: 'hide', t: 0, home: { x, z }, target: null, retarget: 0, stun: 0, scared: 0, sizzle: 0,
    }));
  }

  get alive() {
    return this.list.filter((s) => s.state !== 'dying');
  }

  // empurrao do rugido: joga as sombras para longe do ogro
  roar(x, z) {
    const R = MORNING.roar;
    let n = 0;
    for (const s of this.list) {
      if (s.state === 'dying') continue;
      const dx = s.x - x, dz = s.z - z, d = Math.hypot(dx, dz) || 1e-3;
      if (d > R.radius) continue;
      const k = R.push * (1 - 0.45 * d / R.radius);
      s.vx = (dx / d) * k;
      s.vz = (dz / d) * k;
      s.stun = R.stun;
      s.flash = 1;
      s.state = 'flee';
      s.target = null;
      n++;
    }
    return n;
  }

  _inBound(x, z) {
    return Math.hypot(x - this.bound.x, z - this.bound.z) < this.bound.r;
  }

  // proximo esconderijo: outra sombra de arvore, longe do ogro, sem passar por ele e sem pegar sol demais
  _pickTarget(s, o) {
    const d0 = Math.hypot(s.x - o.x, s.z - o.z) || 1e-3;
    const ux = (s.x - o.x) / d0, uz = (s.z - o.z) / d0;
    const speed = C.speed * C.sunSlow;
    let best = null, bs = -Infinity, nearest = null, nd = Infinity;
    for (const P of this.shade.patches) {
      const dist = Math.hypot(P.x - s.x, P.z - s.z);
      if (dist > 18) continue;
      // mira o lado da sombra que fica mais longe do ogro
      const tx = P.x + ux * P.r * 0.35, tz = P.z + uz * P.r * 0.35;
      if (!this._inBound(tx, tz) || !this.world.isFree(tx, tz, 0.6)) continue;
      if (dist < nd) { nd = dist; nearest = { x: tx, z: tz }; }
      const dOgre = Math.hypot(tx - o.x, tz - o.z);
      if (dOgre < 6) continue;
      const dir = dist > 0.5 ? ((tx - s.x) * ux + (tz - s.z) * uz) / dist : 1;
      if (dir < -0.2 && d0 < 14) continue; // nao passa pelo ogro
      const exposure = this.shade.sunAlong(s.x, s.z, tx, tz) / speed;
      if (s.sun + exposure / C.sunTime > 0.8) continue; // queimaria no caminho
      const score = Math.min(dOgre - d0, 10) * 0.6 - exposure * 2 - dist * 0.04 + Math.random() * 0.4;
      if (score > bs) { bs = score; best = { x: tx, z: tz }; }
    }
    if (best) return best;
    // encurralada: no sol corre para a sombra mais perto; na sombra corre direto para longe
    if (this.shade.at(s.x, s.z) < 0.45 && nearest) return nearest;
    return { x: s.x + ux * 6, z: s.z + uz * 6 };
  }

  update(dt, time, ctx) {
    const o = ctx.ogre;
    const fear = ctx.running ? C.fearRun : C.fear;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt;
      s.flash = Math.max(0, s.flash - dt * 3);
      if (s.state === 'dying') {
        if (s.t > SHADOW_DIE_TIME) this.list.splice(i, 1);
        continue;
      }

      // luz do sol
      const shade = this.shade.at(s.x, s.z);
      const inSun = shade < 0.45;
      if (inSun && ctx.active) {
        s.sun = Math.min(1, s.sun + dt / C.sunTime);
        s.burn = 1;
        s.sizzle -= dt;
        if (s.sizzle <= 0) {
          s.sizzle = 0.25;
          ctx.onSizzle(s);
        }
        this._burnFx(s, dt);
      } else {
        s.sun = Math.max(0, s.sun - dt * C.recover);
        s.burn = Math.max(0, s.burn - dt * 3);
      }
      s.shiver = s.sun;
      if (s.sun >= 1) {
        s.state = 'dying';
        s.t = 0;
        ctx.onTransform(s);
        continue;
      }

      const d = Math.hypot(o.x - s.x, o.z - s.z);
      let wx = 0, wz = 0, speed = 0;
      if (s.stun > 0) {
        // arremessada pelo rugido: so desliza
        s.stun -= dt;
        const drag = Math.exp(-2 * dt);
        s.vx *= drag;
        s.vz *= drag;
      } else {
        if (ctx.active && (d < fear || inSun) && s.state !== 'flee') {
          s.state = 'flee';
          s.target = null;
          if (s.scared <= 0) ctx.onScared(s);
          s.scared = 2.5;
        }
        s.scared -= dt;

        if (s.state === 'flee') {
          s.retarget -= dt;
          const reached = s.target && Math.hypot(s.target.x - s.x, s.target.z - s.z) < 0.8;
          if (reached && d > fear && !inSun) {
            s.state = 'hide';
            s.home = { ...s.target };
          } else if (!s.target || reached || s.retarget <= 0) {
            s.target = this._pickTarget(s, o);
            s.retarget = 0.8 + Math.random() * 0.4;
          }
        }
        if (s.state === 'flee') {
          wx = s.target.x - s.x;
          wz = s.target.z - s.z;
          speed = C.speed * (inSun ? C.sunSlow : 1);
          // muito perto do ogro: foge direto
          if (d < 3.5) {
            const k = ((3.5 - d) / 3.5) * 9;
            wx += ((s.x - o.x) / (d || 1)) * k;
            wz += ((s.z - o.z) / (d || 1)) * k;
          }
        } else {
          // escondida: passeia devagar no meio da sombra
          const a = time * 0.4 + s.phase;
          wx = s.home.x + Math.cos(a) * 0.8 - s.x;
          wz = s.home.z + Math.sin(a * 1.3) * 0.8 - s.z;
          speed = Math.min(0.9, Math.hypot(wx, wz));
        }
        // desvia dos troncos
        this.world.forNear(s.x, s.z, (c) => {
          const ox = s.x - c.x, oz = s.z - c.z, od = Math.hypot(ox, oz), rr = c.r + 1.2;
          if (od < rr && od > 1e-4) {
            const push = ((rr - od) / rr) * 4;
            wx += (ox / od) * push;
            wz += (oz / od) * push;
          }
        });
        const wl = Math.hypot(wx, wz);
        if (wl > 1e-4) {
          wx /= wl;
          wz /= wl;
        }
        const k = Math.min(1, dt * 5);
        s.vx += (wx * speed - s.vx) * k;
        s.vz += (wz * speed - s.vz) * k;
      }
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      // nao atravessa troncos nem sai da area
      this.world.forNear(s.x, s.z, (c) => {
        const ox = s.x - c.x, oz = s.z - c.z, od = Math.hypot(ox, oz), rr = c.r + 0.5;
        if (od < rr && od > 1e-4) {
          s.x = c.x + (ox / od) * rr;
          s.z = c.z + (oz / od) * rr;
        }
      });
      const b = this.bound, bx = s.x - b.x, bz = s.z - b.z, bd = Math.hypot(bx, bz);
      if (bd > b.r) {
        s.x = b.x + (bx / bd) * b.r;
        s.z = b.z + (bz / bd) * b.r;
      }
      s.y += (this.world.heightAt(s.x, s.z) - s.y) * Math.min(1, dt * 10);

      // olha para onde vai; parada, espia o ogro
      const sp = Math.hypot(s.vx, s.vz);
      let fx = s.vx, fz = s.vz;
      if (sp < 0.4) { fx = o.x - s.x; fz = o.z - s.z; }
      const fl = Math.hypot(fx, fz) || 1;
      s.fx += (fx / fl - s.fx) * Math.min(1, dt * 6);
      s.fz += (fz / fl - s.fz) * Math.min(1, dt * 6);
      s.eyes = s.state === 'flee' || d < fear * 1.5 ? 1 : 0.8;
    }
    this.look.draw(this.list, time, ctx.camPos);
  }

  _burnFx(s, dt) {
    const U = C.unit;
    if (Math.random() < dt * 16) {
      this.fx.norm.emit({
        x: s.x + (Math.random() - 0.5) * 0.6, y: s.y + 0.45 * U + Math.random(), z: s.z + (Math.random() - 0.5) * 0.6,
        vy: 1 + Math.random(), life: 1.2, s0: 0.35, s1: 1.1, r: 0.12, g: 0.08, b: 0.12, a0: 0.45, a1: 0, drag: 1,
      });
    }
    if (Math.random() < dt * 14) {
      this.fx.add.emit({
        x: s.x + (Math.random() - 0.5) * 0.8, y: s.y + 0.4 * U + Math.random() * 0.8, z: s.z + (Math.random() - 0.5) * 0.8,
        vx: (Math.random() - 0.5) * 1.5, vy: 1.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.5,
        life: 0.6, s0: 0.12, s1: 0, r: 2.4, g: 1.3, b: 0.3, a0: 1, a1: 0, drag: 1.5,
      });
    }
  }
}
