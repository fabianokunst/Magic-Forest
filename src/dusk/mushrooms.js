import * as THREE from 'three';
import { makeGlowSprite } from '../core/fx.js';

const COLORS = [0xff6b8a, 0x5fe0ff, 0xffa04a, 0xc58aff, 0x7dff9a];

// Cogumelos-luz: tufos espalhados pelo bosque (cada tufo vale 1) e cogumelos soltos (derrubados pelo ogro).
export class Mushrooms {
  constructor(parent, world, size = 1) {
    this.parent = parent;
    this.world = world;
    this.size = size;
    const r = 0.36 * size;
    this.capGeo = new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.72, 1);
    this.gillGeo = new THREE.CircleGeometry(r * 0.98, 18).rotateX(Math.PI / 2);
    this.stemGeo = new THREE.CylinderGeometry(r * 0.32, r * 0.42, r * 1.25, 10).translate(0, r * 0.62, 0);
    this.dotGeo = new THREE.SphereGeometry(r * 0.13, 8, 6);
    this.stemMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.8, emissive: 0xffe6b0, emissiveIntensity: 0.1 });
    this.dotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.3 });
    this.capMats = COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, emissive: c, emissiveIntensity: 0.3 }));
    this.gillMats = COLORS.map((c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.6), roughness: 0.9, side: THREE.DoubleSide }));
    this.spots = [];
    this.loose = [];
    this.glow = 0;
  }

  _mushroom(color, scale) {
    const g = new THREE.Group();
    const r = 0.36 * this.size;
    const stem = new THREE.Mesh(this.stemGeo, this.stemMat);
    const cap = new THREE.Group();
    cap.position.y = r * 1.2;
    cap.add(new THREE.Mesh(this.capGeo, this.capMats[color]), new THREE.Mesh(this.gillGeo, this.gillMats[color]));
    for (let i = 0; i < 6; i++) {
      // pintinhas brancas na parte de cima do chapeu
      const a = i * 2.4 + Math.random() * 0.4, el = 0.45 + (i % 3) * 0.3;
      const d = new THREE.Mesh(this.dotGeo, this.dotMat);
      d.position.set(Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r * 0.72, Math.sin(a) * Math.cos(el) * r);
      d.scale.set(1, 0.45, 1);
      d.lookAt(d.position.clone().multiplyScalar(2));
      cap.add(d);
    }
    cap.rotation.z = (Math.random() - 0.5) * 0.3;
    g.add(stem, cap);
    g.scale.setScalar(scale);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  reset(spots) {
    for (const s of [...this.spots, ...this.loose]) this.parent.remove(s.root);
    this.spots = spots.map(([x, z], i) => {
      const color = i % COLORS.length;
      const root = new THREE.Group();
      root.position.set(x, this.world.heightAt(x, z) - 0.05, z);
      root.add(this._mushroom(color, 1));
      for (let k = 0; k < 2; k++) {
        const m = this._mushroom(color, 0.5 + Math.random() * 0.2);
        const a = Math.random() * Math.PI * 2;
        m.position.set(Math.cos(a) * 0.45 * this.size, 0, Math.sin(a) * 0.45 * this.size);
        root.add(m);
      }
      const halo = makeGlowSprite(COLORS[color], 2.4 * this.size, 0);
      halo.position.y = 0.55 * this.size;
      root.add(halo);
      root.rotation.y = Math.random() * Math.PI * 2;
      this.parent.add(root);
      return { root, halo, x, z, color, taken: false, phase: Math.random() * 10, fly: null };
    });
    this.loose = [];
  }

  get left() {
    return this.spots.filter((s) => !s.taken).length + this.loose.length;
  }

  // cogumelos que o ogro derruba: voam e caem por perto
  drop(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const color = Math.floor(Math.random() * COLORS.length);
      const root = new THREE.Group();
      root.add(this._mushroom(color, 0.75));
      const halo = makeGlowSprite(COLORS[color], 1.6 * this.size, 0);
      halo.position.y = 0.4 * this.size;
      root.add(halo);
      root.position.set(x, y, z);
      this.parent.add(root);
      const a = Math.random() * Math.PI * 2, sp = 2.5 + Math.random() * 1.5;
      this.loose.push({
        root, halo, x, z, color, phase: Math.random() * 10, landed: false, fly: null,
        vel: new THREE.Vector3(Math.cos(a) * sp, 5 + Math.random() * 2, Math.sin(a) * sp), wait: 0.6,
      });
    }
  }

  // glow: 0 de dia ... 1 de noite. onPick(m) quando o ogro pega um.
  update(dt, time, { ogre, reach, canPick, onPick, bucket, glow }) {
    this.glow = glow;
    for (const m of this.capMats) m.emissiveIntensity = 0.25 + glow * 2.4;
    this.dotMat.emissiveIntensity = 0.3 + glow * 1.2;
    this.stemMat.emissiveIntensity = 0.1 + glow * 0.5;

    const pick = (m) => {
      m.fly = { t: 0, from: m.root.position.clone() };
      onPick(m);
    };
    for (const s of this.spots) {
      if (s.taken && !s.fly) continue;
      if (s.fly) {
        this._flyToBucket(s, dt, bucket);
        continue;
      }
      const k = 1 + 0.04 * Math.sin(time * 2.2 + s.phase);
      s.root.scale.set(k, 2 - k, k);
      s.halo.material.opacity = (0.15 + 0.55 * glow) * (0.8 + 0.2 * Math.sin(time * 3 + s.phase));
      if (canPick && Math.hypot(ogre.x - s.x, ogre.z - s.z) < reach) {
        s.taken = true;
        pick(s);
      }
    }
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const m = this.loose[i];
      if (m.fly) {
        if (this._flyToBucket(m, dt, bucket)) this.loose.splice(i, 1);
        continue;
      }
      const p = m.root.position;
      if (!m.landed) {
        m.vel.y -= 14 * dt;
        p.addScaledVector(m.vel, dt);
        m.root.rotation.x += dt * 8;
        const g = this.world.heightAt(p.x, p.z);
        if (p.y <= g) {
          p.y = g;
          m.landed = true;
          m.root.rotation.set(0, Math.random() * 6, 0);
        }
        m.x = p.x;
        m.z = p.z;
      } else {
        m.wait -= dt;
        m.halo.material.opacity = (0.3 + 0.5 * glow) * (0.7 + 0.3 * Math.sin(time * 5 + m.phase));
        if (canPick && m.wait <= 0 && Math.hypot(ogre.x - m.x, ogre.z - m.z) < reach) pick(m);
      }
    }
  }

  // voa ate o balde encolhendo; devolve true quando chega
  _flyToBucket(m, dt, bucket) {
    const f = m.fly;
    f.t += dt / 0.35;
    const k = Math.min(1, f.t);
    m.root.position.lerpVectors(f.from, bucket, k * k);
    m.root.position.y += Math.sin(k * Math.PI) * 1.2;
    m.root.scale.setScalar(Math.max(0.01, 1 - k * 0.9));
    m.halo.material.opacity = 0.8 * (1 - k);
    if (k >= 1) {
      this.parent.remove(m.root);
      m.fly = null;
      return true;
    }
    return false;
  }
}
