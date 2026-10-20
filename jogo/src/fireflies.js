import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PointBuffer } from './fx.js';

export class Fireflies {
  constructor(scene, world) {
    this.world = world;
    this.buf = new PointBuffer(scene, 96, THREE.AdditiveBlending, 1.6);
    this.list = [];
    this.timer = 0;
  }

  reset() {
    this.list.length = 0;
    this.timer = 0;
    for (let i = 0; i < 14; i++) this.spawnRandom();
  }

  _free(x, z) {
    const d = Math.hypot(x, z);
    if (d < 3.2 || d > CONFIG.worldRadius - 0.6) return false;
    return !this.world.trees.some((t) => Math.hypot(x - t.x, z - t.z) < t.col + 0.2);
  }

  spawnRandom() {
    let x = 6, z = 0;
    for (let i = 0; i < 12; i++) {
      if (Math.random() < 0.6) {
        const t = this.world.trees[Math.floor(Math.random() * this.world.trees.length)];
        const a = Math.random() * Math.PI * 2;
        const d = t.col + 0.4 + Math.random() * 2.4;
        x = t.x + Math.cos(a) * d;
        z = t.z + Math.sin(a) * d;
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 11.5;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      if (this._free(x, z)) break;
    }
    this.list.push(this._make(x, 0.35 + Math.random() * 0.9, z, 'free'));
  }

  _make(x, y, z, state) {
    return { x, y, z, vx: 0, vy: 0, vz: 0, phase: Math.random() * 100, state, t: 0, appear: 0, seed: Math.random() * 10 };
  }

  // vagalumes que escapam do balde
  scatter(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const f = this._make(x, y, z, 'scatter');
      const a = Math.random() * Math.PI * 2;
      const s = 1.8 + Math.random() * 1.6;
      f.vx = Math.cos(a) * s;
      f.vz = Math.sin(a) * s;
      f.vy = 1 + Math.random();
      f.t = 1.3;
      f.appear = 1;
      this.list.push(f);
    }
  }

  spawnAt(x, y, z) {
    const f = this._make(x, y, z, 'scatter');
    f.vy = 0.8;
    f.vx = (Math.random() - 0.5) * 1.2;
    f.vz = (Math.random() - 0.5) * 1.2;
    f.t = 0.5;
    this.list.push(f);
  }

  update(dt, time, ctx) {
    if (ctx.spawn && this.list.length < CONFIG.firefly.max) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.spawnRandom();
        this.timer = CONFIG.firefly.spawnEvery;
      }
    }
    const c = ctx.catcher;
    const R = CONFIG.worldRadius;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.appear = Math.min(1, f.appear + dt * 0.8);
      if (f.state === 'scatter') {
        f.t -= dt;
        const d = Math.exp(-2.2 * dt);
        f.vx *= d; f.vy *= d; f.vz *= d;
        if (f.t <= 0) f.state = 'free';
      } else {
        // voo errante, suave
        const s = f.seed;
        const tx = Math.sin(time * 0.53 + s * 3.1) + 0.5 * Math.sin(time * 1.31 + s * 7.7);
        const tz = Math.cos(time * 0.47 + s * 5.3) + 0.5 * Math.cos(time * 1.13 + s * 2.9);
        const ty = 0.75 + 0.45 * Math.sin(time * 0.7 + s * 4.1);
        f.vx += (tx * 0.35 - f.vx) * dt * 1.2;
        f.vz += (tz * 0.35 - f.vz) * dt * 1.2;
        f.vy += ((ty - f.y) * 1.2 - f.vy) * dt * 2;
        const dc = Math.hypot(f.x, f.z);
        if (dc < 3) { f.vx += (f.x / dc) * dt * 1.5; f.vz += (f.z / dc) * dt * 1.5; }
        if (dc > R - 0.8) { f.vx -= (f.x / dc) * dt * 1.5; f.vz -= (f.z / dc) * dt * 1.5; }

        if (ctx.canCatch && c) {
          const dx = c.x - f.x, dy = c.y - f.y, dz = c.z - f.z;
          const d = Math.hypot(dx, dy, dz);
          if (d < CONFIG.firefly.catch) {
            this.list.splice(i, 1);
            ctx.onCatch(f);
            continue;
          }
          if (d < CONFIG.firefly.magnet) {
            const pull = (1 - d / CONFIG.firefly.magnet) * 14 + 2;
            f.vx += (dx / d) * pull * dt;
            f.vy += (dy / d) * pull * dt;
            f.vz += (dz / d) * pull * dt;
            const damp = Math.exp(-3 * dt);
            f.vx *= damp; f.vy *= damp; f.vz *= damp;
          }
        }
      }
      f.x += f.vx * dt;
      f.y = Math.max(0.12, f.y + f.vy * dt);
      f.z += f.vz * dt;
    }

    const b = this.buf;
    b.begin();
    for (const f of this.list) {
      const blink = 0.5 + 0.5 * Math.sin(time * 3.1 + f.phase);
      const a = f.appear * (0.35 + 0.65 * blink * blink);
      b.push(f.x, f.y, f.z, 0.55, 2.4, 1.0, 0.075 + 0.035 * blink, a);
      b.push(f.x, f.y, f.z, 0.2, 0.9, 0.45, 0.32, a * 0.25);
    }
    b.end();
  }
}
