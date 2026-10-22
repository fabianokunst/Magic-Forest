import * as THREE from 'three';
import { ShadowLook } from '../core/shadow-look.js';
import { PointBuffer } from '../core/fx.js';
import { MOON } from './config.js';

const C = MOON.thief;
const U = C.unit;
const lerp = THREE.MathUtils.lerp;

// Sombras da lua cheia: ladras de luz. Nao entram na luz das flores e rondam o ogro pelo escuro.
// Quando ele leva flores no balde, sentem o brilho e vem roubar; fogem com a flor, cada vez mais cansadas.
// Se o ogro alcancar a ladra (ou rugir perto), pega a flor de volta; se nao, ela larga a flor no mato.
export class Thieves {
  constructor(parent, world, bound) {
    this.world = world;
    this.bound = bound;
    this.look = new ShadowLook(parent, 10, U);
    this.held = new PointBuffer(parent, 30, THREE.AdditiveBlending, 1.5);
    this.held.points.renderOrder = 5;
    this.list = [];
    this.zones = []; // luzes que elas nao atravessam: { x, z, r }
  }

  reset() {
    this.list.length = 0;
  }

  get active() {
    return this.list.filter((s) => s.state === 'emerge' || s.state === 'lurk' || s.state === 'chase');
  }

  get thieves() {
    return this.list.filter((s) => s.state === 'flee');
  }

  inLight(x, z, pad = 0) {
    return this.zones.some((L) => Math.hypot(x - L.x, z - L.z) < L.r + pad);
  }

  // nasce no escuro a uma certa distancia do ogro, de preferencia mais a frente no caminho dele (dir)
  spawn(ogre, dir) {
    let best = null, bs = -Infinity;
    const p = { x: 0, z: 0 };
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = lerp(C.near[0], C.near[1], Math.random());
      p.x = ogre.x + Math.cos(a) * r;
      p.z = ogre.z + Math.sin(a) * r;
      const x = p.x, z = p.z;
      this.bound.clamp(p);
      if (p.x !== x || p.z !== z) continue;
      if (this.inLight(x, z, 1.5) || !this.world.isFree(x, z, 1)) continue;
      const score = Math.cos(a) * dir.x + Math.sin(a) * dir.z + Math.random() * 0.5;
      if (score > bs) {
        bs = score;
        best = this._make(x, z);
      }
    }
    if (best) this.list.push(best);
    return best;
  }

  _make(x, z) {
    return {
      x, z, y: this.world.heightAt(x, z), vx: 0, vz: 0, scale: 1, alpha: 0,
      phase: Math.random() * 100, fx: 0, fz: 1, flash: 0, burn: 0, sun: 0, eyes: 1, shiver: 0,
      state: 'emerge', t: 0, wait: 0, orbit: Math.random() < 0.5 ? -1 : 1, near: false,
    };
  }

  // rugido: as que estao perto fogem; a ladra devolve a flor (onRecover)
  roar(x, z, radius, onRecover) {
    let n = 0;
    for (const s of this.list) {
      if (Math.hypot(s.x - x, s.z - z) > radius) continue;
      if (s.state === 'flee') {
        onRecover(s);
        this.vanish(s);
      } else if (s.state === 'emerge' || s.state === 'lurk' || s.state === 'chase') {
        this.scare(s, x, z);
      } else continue;
      n++;
    }
    return n;
  }

  scare(s, fromX, fromZ) {
    const dx = s.x - fromX, dz = s.z - fromZ, d = Math.hypot(dx, dz) || 1;
    s.state = 'scared';
    s.t = 0;
    s.flash = 1;
    s.vx = (dx / d) * 7;
    s.vz = (dz / d) * 7;
  }

  // some num puf (pegou a flor de volta, ou largou no mato)
  vanish(s) {
    s.state = 'gone';
    s.t = 0;
    s.flash = 1;
  }

  // ctx: { ogre, vel, carried, progress, active, camPos, onSteal(s), onRecover(s), onEscape(s), onNear(s) }
  update(dt, time, ctx) {
    const o = ctx.ogre;
    const sense = C.sense[0] + C.sense[1] * ctx.carried;
    const chase = lerp(C.speed[0], C.speed[1], ctx.progress);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt;
      s.flash = Math.max(0, s.flash - dt * 3);
      s.wait -= dt;

      if (s.state === 'scared' || s.state === 'gone') {
        const life = s.state === 'scared' ? 1.2 : 0.5;
        s.alpha = Math.max(0, 1 - s.t / life);
        s.scale = s.state === 'gone' ? 1 + s.t * 1.5 : 1;
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        s.vx *= Math.exp(-2 * dt);
        s.vz *= Math.exp(-2 * dt);
        s.y += (this.world.heightAt(s.x, s.z) - s.y) * Math.min(1, dt * 10);
        if (s.t > life) this.list.splice(i, 1);
        continue;
      }
      if (s.state === 'emerge') {
        s.alpha = Math.min(1, s.t / 1.2);
        if (s.t > 1.2) s.state = 'lurk';
      }

      const dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz) || 1e-3;
      let tx = s.x, tz = s.z, speed = 0;
      if (s.state === 'lurk') {
        if (ctx.active && ctx.carried > 0 && d < sense && s.wait <= 0) s.state = 'chase';
        // ronda o ogro de longe, girando devagar em volta dele
        const a = Math.atan2(s.z - o.z, s.x - o.x) + s.orbit * 0.35;
        tx = o.x + Math.cos(a) * C.lurk;
        tz = o.z + Math.sin(a) * C.lurk;
        speed = Math.min(2.6, Math.hypot(tx - s.x, tz - s.z) * 1.2);
      }
      if (s.state === 'chase') {
        if (!ctx.active || ctx.carried === 0 || d > sense + 6) {
          s.state = 'lurk';
        } else {
          // mira um pouco a frente do ogro, para cortar o caminho dele
          const lead = Math.min(0.6, d / 8);
          tx = o.x + ctx.vel.x * lead;
          tz = o.z + ctx.vel.y * lead;
          speed = chase;
          if (d < 6 && !s.near) ctx.onNear(s);
          s.near = d < 6;
          if (d < C.touch && ctx.onSteal(s)) {
            s.state = 'flee';
            s.t = 0;
            // as outras dao um tempo antes de tentar de novo
            for (const q of this.list) {
              if (q !== s && q.state === 'chase' && Math.hypot(q.x - o.x, q.z - o.z) < 7) {
                q.state = 'lurk';
                q.wait = 1.5;
              }
            }
          }
        }
      }
      if (s.state === 'flee') {
        if (ctx.active && s.t > C.getaway && d < C.grab) {
          ctx.onRecover(s);
          this.vanish(s);
          continue;
        }
        if (s.t >= C.escape) {
          ctx.onEscape(s);
          this.vanish(s);
          continue;
        }
        // foge para longe do ogro, ziguezagueando
        const w = Math.sin(s.t * 2.2 + s.phase) * 0.6;
        const ux = -dx / d, uz = -dz / d;
        tx = s.x + (ux - uz * w) * 6;
        tz = s.z + (uz + ux * w) * 6;
        speed = lerp(C.flee[0], C.flee[1], s.t / C.escape);
      }

      let wx = tx - s.x, wz = tz - s.z;
      const wl = Math.hypot(wx, wz);
      if (wl > 1e-4) {
        wx /= wl;
        wz /= wl;
      }
      // desvia dos troncos (pelo lado) e da luz
      this.world.forNear(s.x, s.z, (c) => {
        const ox = s.x - c.x, oz = s.z - c.z, od = Math.hypot(ox, oz), rr = c.r + 1.4;
        if (od < rr && od > 1e-4) {
          const push = ((rr - od) / rr) * 2.5;
          const side = Math.sign(ox * wz - oz * wx) || 1;
          wx += (ox / od) * push + (-oz / od) * push * side * 0.8;
          wz += (oz / od) * push + (ox / od) * push * side * 0.8;
        }
      });
      for (const L of this.zones) {
        const ox = s.x - L.x, oz = s.z - L.z, od = Math.hypot(ox, oz), rr = L.r + 2;
        if (od < rr && od > 1e-4) {
          const push = ((rr - od) / 2) * 1.5;
          wx += (ox / od) * push;
          wz += (oz / od) * push;
        }
      }
      const fl = Math.hypot(wx, wz) || 1;
      const k = Math.min(1, dt * 6);
      s.vx += ((wx / fl) * speed - s.vx) * k;
      s.vz += ((wz / fl) * speed - s.vz) * k;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      // nao atravessa troncos, luz nem o limite da area
      this.world.forNear(s.x, s.z, (c) => {
        const ox = s.x - c.x, oz = s.z - c.z, od = Math.hypot(ox, oz), rr = c.r + 0.5;
        if (od < rr && od > 1e-4) {
          s.x = c.x + (ox / od) * rr;
          s.z = c.z + (oz / od) * rr;
        }
      });
      for (const L of this.zones) {
        const ox = s.x - L.x, oz = s.z - L.z, od = Math.hypot(ox, oz);
        if (od < L.r && od > 1e-4) {
          s.x = L.x + (ox / od) * L.r;
          s.z = L.z + (oz / od) * L.r;
        }
      }
      this.bound.clamp(s);
      s.y += (this.world.heightAt(s.x, s.z) - s.y) * Math.min(1, dt * 10);

      // olha para onde vai; devagar, encara o ogro
      const sp = Math.hypot(s.vx, s.vz);
      let fx = s.vx, fz = s.vz;
      if (sp < 1 || s.state === 'lurk') { fx = dx; fz = dz; }
      const fll = Math.hypot(fx, fz) || 1;
      s.fx += (fx / fll - s.fx) * Math.min(1, dt * 6);
      s.fz += (fz / fll - s.fz) * Math.min(1, dt * 6);
      s.shiver = s.state === 'flee' ? 0.25 : 0;
    }
    this.look.draw(this.list, time, ctx.camPos);

    // a flor roubada brilha nos "bracos" da ladra
    const h = this.held;
    h.begin();
    for (const s of this.list) {
      if (s.state !== 'flee') continue;
      const x = s.x + s.fx * 0.35 * U, z = s.z + s.fz * 0.35 * U;
      const y = s.y + 0.55 * U + Math.sin(time * 6 + s.phase) * 0.05 * U;
      h.push(x, y, z, 0.6, 1.6, 2.4, 1.1, 0.5);
      h.push(x, y, z, 1.8, 2.4, 2.6, 0.35, 1);
    }
    h.end();
  }
}
