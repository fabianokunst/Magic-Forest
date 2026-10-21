import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeGlowSprite } from '../core/fx.js';

const G = 9.8;

export class Apples {
  constructor(scene, fx, world) {
    this.scene = scene;
    this.fx = fx;
    this.world = world;
    this.bodyGeo = new THREE.SphereGeometry(0.048, 14, 10).scale(1, 0.9, 1);
    this.stemGeo = new THREE.CylinderGeometry(0.004, 0.005, 0.03, 5).translate(0, 0.055, 0);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0xc0261a, roughness: 0.35, emissive: 0x3a0500, emissiveIntensity: 1 });
    this.stemMat = new THREE.MeshStandardMaterial({ color: 0x5a3415, roughness: 0.8 });
    this.flying = [];
    this.ground = [];
  }

  _mesh() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.bodyGeo, this.bodyMat), new THREE.Mesh(this.stemGeo, this.stemMat));
    g.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.scene.add(g);
    return g;
  }

  reset() {
    for (const a of [...this.flying, ...this.ground]) this.scene.remove(a.m);
    this.flying.length = 0;
    this.ground.length = 0;
  }

  launch(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const T = Math.max(0.22, Math.hypot(dx, dz) / CONFIG.apples.speed);
    const m = this._mesh();
    m.position.copy(from);
    this.flying.push({
      m, v: new THREE.Vector3(dx / T, (dy + 0.5 * G * T * T) / T, dz / T),
      spin: new THREE.Vector3(Math.random() * 14, Math.random() * 14, 0), bounces: 0, live: true,
    });
  }

  // maca solta (caindo da arvore ou derrubada): nao machuca sombras
  drop(x, y, z, vx = 0, vy = 0, vz = 0) {
    const m = this._mesh();
    m.position.set(x, y, z);
    this.flying.push({ m, v: new THREE.Vector3(vx, vy, vz), spin: new THREE.Vector3(3, 2, 0), bounces: 0, live: false });
  }

  _land(a) {
    const glow = makeGlowSprite(0xff6a4a, 0.35, 0.5);
    a.m.add(glow);
    a.glow = glow;
    a.t = 0;
    a.phase = Math.random() * 6;
    this.ground.push(a);
    if (this.ground.length > 30) {
      const old = this.ground.shift();
      this.scene.remove(old.m);
    }
  }

  update(dt, time, ctx) {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const a = this.flying[i];
      const p = a.m.position;
      a.v.y -= G * dt;
      p.addScaledVector(a.v, dt);
      a.m.rotation.x += a.spin.x * dt;
      a.m.rotation.y += a.spin.y * dt;

      if (a.live) {
        let hit = null;
        for (const s of ctx.shadows.list) {
          if (s.state === 'dying' || s.state === 'flee' || s.state === 'emerge') continue;
          const d = Math.hypot(p.x - s.x, p.y - 0.42 * s.scale, p.z - s.z);
          if (d < 0.32 * s.scale + 0.05) { hit = s; break; }
        }
        if (hit) {
          this.scene.remove(a.m);
          this.flying.splice(i, 1);
          this.fx.add.burst(10, () => ({
            x: p.x, y: p.y, z: p.z,
            vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 3,
            life: 0.45, s0: 0.05, s1: 0, r: 2, g: 0.25, b: 0.15, a0: 1, a1: 0, drag: 2, grav: 4,
          }));
          ctx.onHit(hit, p);
          continue;
        }
      }

      for (const t of this.world.trees) {
        if (p.y > 3) continue;
        const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz), r = t.col + 0.05;
        if (d < r && d > 1e-4) {
          p.x = t.x + (dx / d) * r;
          p.z = t.z + (dz / d) * r;
          const nx = dx / d, nz = dz / d, vn = a.v.x * nx + a.v.z * nz;
          if (vn < 0) {
            a.v.x -= 1.6 * vn * nx;
            a.v.z -= 1.6 * vn * nz;
          }
          a.live = false;
        }
      }

      const gh = this.world.heightAt(p.x, p.z) + 0.043;
      if (p.y <= gh) {
        p.y = gh;
        if (Math.abs(a.v.y) > 1.2 && a.bounces < 2) {
          a.v.y = -a.v.y * 0.35;
          a.v.x *= 0.55;
          a.v.z *= 0.55;
          a.bounces++;
          a.live = false;
        } else {
          this.flying.splice(i, 1);
          this._land(a);
        }
      }
      const R = CONFIG.worldRadius, d = Math.hypot(p.x, p.z);
      if (d > R) { p.x *= R / d; p.z *= R / d; a.v.x *= -0.3; a.v.z *= -0.3; }
    }

    for (let i = this.ground.length - 1; i >= 0; i--) {
      const a = this.ground[i];
      a.t += dt;
      a.glow.material.opacity = 0.35 + 0.2 * Math.sin(time * 3 + a.phase);
      const p = a.m.position;
      if (ctx.canPickup && Math.hypot(p.x - ctx.ogre.x, p.z - ctx.ogre.z) < 0.42) {
        this.scene.remove(a.m);
        this.ground.splice(i, 1);
        ctx.onPickup(p);
      }
    }
  }
}
