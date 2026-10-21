import * as THREE from 'three';
import { ShadowLook } from '../core/shadow-look.js';
import { DUSK } from './config.js';

const C = DUSK.stalker;

// Sombras do entardecer: como na batatinha frita, so andam quando o ogro esta de costas para elas.
// Quando ele olha, congelam e fecham os olhinhos.
export class Stalkers {
  constructor(parent, world) {
    this.world = world;
    this.look = new ShadowLook(parent, 10, C.unit);
    this.list = [];
    this.gaze = { x: 0, z: 0, fx: 0, fz: 1 }; // de onde e para onde o ogro olha
  }

  reset() {
    this.list.length = 0;
  }

  get active() {
    return this.list.filter((s) => s.state === 'emerge' || s.state === 'stalk');
  }

  // o ogro esta olhando para a sombra (dentro do cone do olhar e nao muito longe)?
  seen(s) {
    const g = this.gaze;
    const dx = s.x - g.x, dz = s.z - g.z, d = Math.hypot(dx, dz);
    if (d > C.see) return false;
    return d < 0.5 || (dx * g.fx + dz * g.fz) / d > C.cone;
  }

  // nasce a uma certa distancia do ogro, dentro do bosque e de preferencia nas costas dele
  spawn(ogre) {
    const c = DUSK.center;
    let best = null;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = C.near[0] + Math.random() * (C.near[1] - C.near[0]);
      const x = ogre.x + Math.cos(a) * r, z = ogre.z + Math.sin(a) * r;
      if (Math.hypot(x - c.x, z - c.z) > DUSK.radius - 1 || !this.world.isFree(x, z, 1)) continue;
      const s = this._make(x, z);
      best = s;
      if (!this.seen(s)) break;
    }
    if (best) this.list.push(best);
    return best;
  }

  _make(x, z) {
    return {
      x, z, y: this.world.heightAt(x, z), vx: 0, vz: 0, scale: 1, alpha: 0,
      phase: Math.random() * 100, fx: 0, fz: 1, flash: 0, burn: 0, sun: 0, eyes: 1, shiver: 0,
      state: 'emerge', t: 0, frozen: false, wake: 0, near: false,
    };
  }

  // rugido: as que estao perto fogem e somem
  roar(x, z, radius) {
    let n = 0;
    for (const s of this.list) {
      if (s.state !== 'stalk' && s.state !== 'emerge') continue;
      if (Math.hypot(s.x - x, s.z - z) > radius) continue;
      this.scare(s, x, z);
      n++;
    }
    return n;
  }

  scare(s, fromX, fromZ) {
    const dx = s.x - fromX, dz = s.z - fromZ, d = Math.hypot(dx, dz) || 1;
    s.state = 'flee';
    s.t = 0;
    s.flash = 1;
    s.eyes = 1;
    s.vx = (dx / d) * 7;
    s.vz = (dz / d) * 7;
  }

  update(dt, time, ctx) {
    const o = ctx.ogre;
    const speed = THREE.MathUtils.lerp(C.speed[0], C.speed[1], ctx.progress);
    Object.assign(this.gaze, ctx.gaze);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt;
      s.flash = Math.max(0, s.flash - dt * 3);

      if (s.state === 'flee') {
        s.alpha = Math.max(0, 1 - s.t / 1.2);
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        if (s.t > 1.2) this.list.splice(i, 1);
        s.y += (this.world.heightAt(s.x, s.z) - s.y) * Math.min(1, dt * 10);
        continue;
      }
      if (s.state === 'emerge') {
        s.alpha = Math.min(1, s.t / 1.4);
        if (s.t > 1.4) s.state = 'stalk';
      }

      const seen = this.seen(s);
      const d = Math.hypot(o.x - s.x, o.z - s.z);
      let moving = false;
      if (seen) {
        // congelou: fecha os olhos e treme
        if (!s.frozen && s.state === 'stalk') ctx.onFreeze(s, d);
        s.frozen = true;
        s.wake = C.wake;
        s.vx = s.vz = 0;
      } else {
        s.wake -= dt;
        if (s.wake <= 0 && s.state === 'stalk' && ctx.active) {
          s.frozen = false;
          moving = true;
        }
      }
      s.eyes += ((s.frozen ? 0 : 1) - s.eyes) * Math.min(1, dt * 12);
      s.shiver = s.frozen ? 0.35 : 0;

      if (moving) {
        let wx = (o.x - s.x) / (d || 1), wz = (o.z - s.z) / (d || 1);
        this.world.forNear(s.x, s.z, (c) => {
          const ox = s.x - c.x, oz = s.z - c.z, od = Math.hypot(ox, oz), rr = c.r + 1.4;
          if (od < rr && od > 1e-4) {
            const push = (rr - od) / rr * 2.5;
            // contorna o tronco pelo lado
            const side = Math.sign(ox * wz - oz * wx) || 1;
            wx += (ox / od) * push + (-oz / od) * push * side * 0.8;
            wz += (oz / od) * push + (ox / od) * push * side * 0.8;
          }
        });
        const wl = Math.hypot(wx, wz) || 1;
        const k = Math.min(1, dt * 6);
        s.vx += ((wx / wl) * speed - s.vx) * k;
        s.vz += ((wz / wl) * speed - s.vz) * k;
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        this.world.forNear(s.x, s.z, (c) => {
          const ox = s.x - c.x, oz = s.z - c.z, od = Math.hypot(ox, oz), rr = c.r + 0.5;
          if (od < rr && od > 1e-4) {
            s.x = c.x + (ox / od) * rr;
            s.z = c.z + (oz / od) * rr;
          }
        });
        const fl = Math.hypot(s.vx, s.vz) || 1;
        s.fx += (s.vx / fl - s.fx) * Math.min(1, dt * 8);
        s.fz += (s.vz / fl - s.fz) * Math.min(1, dt * 8);
        if (d < C.hear && !s.near) ctx.onNear(s);
        s.near = d < C.hear;
        if (d < C.touch) ctx.onCatch(s);
      } else {
        // parada: fica de frente para o ogro
        const tx = o.x - s.x, tz = o.z - s.z, tl = Math.hypot(tx, tz) || 1;
        s.fx += (tx / tl - s.fx) * Math.min(1, dt * 4);
        s.fz += (tz / tl - s.fz) * Math.min(1, dt * 4);
      }
      s.y += (this.world.heightAt(s.x, s.z) - s.y) * Math.min(1, dt * 10);
    }
    this.look.draw(this.list, time, ctx.camPos);
  }
}
