import * as THREE from 'three';
import { glowTexture, makeGlowSprite } from '../core/fx.js';
import { MOON } from './config.js';

const COLORS = [0x9fe8ff, 0xc9b6ff, 0xe4fbff, 0x8fffe0];
const LIGHTS = 4; // as flores mais perto do ogro ganham luz de verdade (o numero nunca muda: sem recompilar shaders)

// Flores-lua: na trilha (cada tufo vale 1), soltas no mato (largadas por uma sombra) e plantadas no jardim.
// Cada flor acesa faz uma poca de luz no chao que as sombras nao atravessam.
export class MoonFlowers {
  constructor(parent, world) {
    this.parent = parent;
    this.world = world;
    this.petalGeo = new THREE.SphereGeometry(0.16, 10, 6).scale(0.55, 0.14, 1).translate(0, 0, 0.15);
    this.centerGeo = new THREE.SphereGeometry(0.075, 10, 8);
    this.stemGeo = new THREE.CylinderGeometry(0.022, 0.034, 0.8, 6).translate(0, 0.4, 0);
    this.leafGeo = new THREE.SphereGeometry(0.13, 8, 6).scale(0.42, 0.08, 1).translate(0, 0, 0.12);
    this.stemMat = new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.8 });
    this.leafMat = new THREE.MeshStandardMaterial({ color: 0x4f9a5a, roughness: 0.7, side: THREE.DoubleSide });
    this.centerMat = new THREE.MeshStandardMaterial({ color: 0xfff2a0, emissive: 0xffe27a, emissiveIntensity: 2 });
    this.petalMats = COLORS.map((c) => new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 1.5, roughness: 0.5, side: THREE.DoubleSide,
    }));
    this.lights = Array.from({ length: LIGHTS }, () => new THREE.PointLight(0x9fe0ff, 0, 10, 1.5));
    this.gardenLight = new THREE.PointLight(0xb8ecff, 0, 20, 1.4);
    parent.add(...this.lights, this.gardenLight);
    this.spots = [];
    this.loose = [];
    this.planted = [];
    this.garden = [];
  }

  // uma flor: caule, folhas e a cabeca com seis petalas
  _bloom(color, s) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.stemGeo, this.stemMat));
    for (const [y, a] of [[0.18, 0.4], [0.34, 2.9]]) {
      const leaf = new THREE.Mesh(this.leafGeo, this.leafMat);
      leaf.position.y = y;
      leaf.rotation.set(-0.5, a, 0, 'YXZ');
      g.add(leaf);
    }
    const head = new THREE.Group();
    head.position.y = 0.8;
    head.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
    for (let k = 0; k < 6; k++) {
      const p = new THREE.Mesh(this.petalGeo, this.petalMats[color]);
      p.rotation.set(-0.5, (k / 6) * Math.PI * 2, 0, 'YXZ');
      head.add(p);
    }
    head.add(new THREE.Mesh(this.centerGeo, this.centerMat));
    g.add(head);
    g.scale.setScalar(s);
    return g;
  }

  // tufo: uma flor grande e duas pequenas, com um halo
  _tuft(color, size = 1, small = 2) {
    const root = new THREE.Group();
    root.add(this._bloom(color, 1.15 * size));
    for (let k = 0; k < small; k++) {
      const b = this._bloom((color + k + 1) % COLORS.length, (0.62 + Math.random() * 0.15) * size);
      const a = Math.random() * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.38 * size, 0, Math.sin(a) * 0.38 * size);
      root.add(b);
    }
    const halo = makeGlowSprite(COLORS[color], 2.2 * size, 0.6);
    halo.position.y = 0.9 * size;
    root.add(halo);
    root.rotation.y = Math.random() * Math.PI * 2;
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { root, halo };
  }

  // poca de luz no chao, acompanhando o terreno
  _pool(x, z, r, color, opacity) {
    const geo = new THREE.PlaneGeometry(r * 2, r * 2, 10, 10).rotateX(-Math.PI / 2);
    const y0 = this.world.heightAt(x, z);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.world.heightAt(x + pos.getX(i), z + pos.getZ(i)) - y0 + 0.08);
    }
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    mesh.position.set(x, y0, z);
    mesh.renderOrder = 1;
    this.parent.add(mesh);
    return mesh;
  }

  _remove(f) {
    this.parent.remove(f.root);
    if (f.pool) {
      this.parent.remove(f.pool);
      f.pool.geometry.dispose();
      f.pool.material.dispose();
    }
  }

  reset(spots, garden) {
    for (const f of [...this.spots, ...this.loose, ...this.planted]) this._remove(f);
    this.garden = garden;
    this.spots = spots.map(([x, z], i) => {
      const color = i % COLORS.length;
      const { root, halo } = this._tuft(color);
      root.position.set(x, this.world.heightAt(x, z) - 0.05, z);
      this.parent.add(root);
      const pool = this._pool(x, z, MOON.light.flower, 0x6fd8ff, 0.26);
      return { root, halo, pool, x, z, color, taken: false, fly: null, fade: 1, phase: Math.random() * 10 };
    });
    this.loose = [];
    this.planted = [];
  }

  get left() {
    return this.spots.filter((s) => !s.taken).length + this.loose.length;
  }

  // luzes que as sombras nao atravessam: flores ainda no chao
  zones(out) {
    const r = MOON.light.flower;
    for (const s of this.spots) if (!s.taken) out.push({ x: s.x, z: s.z, r });
    for (const m of this.loose) if (m.landed && !m.fly) out.push({ x: m.x, z: m.z, r });
    return out;
  }

  // flor largada por uma sombra: cai no chao e fica brilhando ate o ogro buscar
  drop(x, y, z) {
    const color = Math.floor(Math.random() * COLORS.length);
    const { root, halo } = this._tuft(color, 0.85, 1);
    root.position.set(x, y, z);
    this.parent.add(root);
    const a = Math.random() * Math.PI * 2;
    this.loose.push({
      root, halo, pool: null, x, z, color, phase: Math.random() * 10, landed: false, fly: null, fade: 0, wait: 0.5,
      vel: new THREE.Vector3(Math.cos(a) * 1.5, 4, Math.sin(a) * 1.5),
    });
  }

  // planta a proxima flor do jardim: sai do balde e voa ate o canteiro
  plant(from) {
    const i = this.planted.length;
    const [x, z] = this.garden[i % this.garden.length];
    const color = i % COLORS.length;
    const { root, halo } = this._tuft(color, 0.85, 1);
    root.position.copy(from);
    root.scale.setScalar(0.2);
    this.parent.add(root);
    const f = {
      root, halo, pool: null, x, z, color, phase: Math.random() * 10,
      fly: { t: 0, from: from.clone(), to: new THREE.Vector3(x, this.world.heightAt(x, z) - 0.05, z) }, grow: 0,
    };
    this.planted.push(f);
    return f;
  }

  // onPick(f) quando o ogro colhe uma flor
  update(dt, time, { ogre, reach, canPick, bucket, onPick }) {
    const pick = (f) => {
      f.fly = { t: 0, from: f.root.position.clone() };
      onPick(f);
    };
    for (const s of this.spots) {
      if (s.fade > 0 && s.taken) {
        s.fade = Math.max(0, s.fade - dt * 2.5);
        s.pool.material.opacity = 0.26 * s.fade;
        s.pool.visible = s.fade > 0;
      }
      if (s.fly) {
        if (this._flyToBucket(s, dt, bucket)) s.fly = null;
        continue;
      }
      if (s.taken) continue;
      this._sway(s, time);
      if (canPick() && Math.hypot(ogre.x - s.x, ogre.z - s.z) < reach) {
        s.taken = true;
        pick(s);
      }
    }
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const m = this.loose[i];
      if (m.fly) {
        if (this._flyToBucket(m, dt, bucket)) {
          this._remove(m);
          this.loose.splice(i, 1);
        }
        continue;
      }
      const p = m.root.position;
      if (!m.landed) {
        m.vel.y -= 14 * dt;
        p.addScaledVector(m.vel, dt);
        const g = this.world.heightAt(p.x, p.z);
        if (p.y <= g) {
          p.y = g - 0.05;
          m.landed = true;
          m.x = p.x;
          m.z = p.z;
          m.pool = this._pool(m.x, m.z, MOON.light.flower, 0x6fd8ff, 0);
        }
        continue;
      }
      m.fade = Math.min(1, m.fade + dt * 2);
      m.pool.material.opacity = 0.26 * m.fade;
      m.wait -= dt;
      this._sway(m, time);
      if (m.wait <= 0 && canPick() && Math.hypot(ogre.x - m.x, ogre.z - m.z) < reach) {
        if (m.pool) {
          this.parent.remove(m.pool);
          m.pool.geometry.dispose();
          m.pool.material.dispose();
          m.pool = null;
        }
        pick(m);
      }
    }
    for (const f of this.planted) {
      if (f.fly) {
        const F = f.fly;
        F.t += dt / 0.5;
        const k = Math.min(1, F.t);
        f.root.position.lerpVectors(F.from, F.to, k);
        f.root.position.y += Math.sin(k * Math.PI) * 2;
        f.root.scale.setScalar(0.2 + 0.3 * k);
        if (k >= 1) {
          f.fly = null;
          f.pool = this._pool(f.x, f.z, 1.8, 0x8fe6ff, 0.4);
        }
        continue;
      }
      f.grow = Math.min(1, f.grow + dt * 2.2);
      const e = 1 - Math.pow(1 - f.grow, 3);
      f.root.scale.setScalar(0.5 + 0.5 * e + Math.sin(f.grow * Math.PI) * 0.25);
      this._sway(f, time);
    }

    // luz de verdade nas flores mais perto do ogro, e no jardim conforme ele enche
    const lit = [];
    for (const s of this.spots) if (!s.taken || s.fade > 0) lit.push({ x: s.x, z: s.z, k: s.taken ? s.fade : 1 });
    for (const m of this.loose) if (m.landed && !m.fly) lit.push({ x: m.x, z: m.z, k: m.fade });
    for (const l of lit) l.d = Math.hypot(l.x - ogre.x, l.z - ogre.z);
    lit.sort((a, b) => a.d - b.d);
    this.lights.forEach((light, i) => {
      const l = lit[i];
      if (!l) {
        light.intensity = 0;
        return;
      }
      light.position.set(l.x, this.world.heightAt(l.x, l.z) + 1.4, l.z);
      light.intensity = 5 * l.k * (1 - THREE.MathUtils.smoothstep(l.d, 25, 40));
    });
    const c = MOON.cabin;
    const n = this.planted.filter((f) => !f.fly).length;
    this.gardenLight.position.set(c.x, this.world.heightAt(c.x, c.z) + 4, c.z);
    this.gardenLight.intensity = n ? 3 + n * 0.6 : 0;
  }

  _sway(f, time) {
    f.root.rotation.z = Math.sin(time * 1.3 + f.phase) * 0.05;
    f.halo.material.opacity = 0.45 + 0.2 * Math.sin(time * 2.4 + f.phase);
  }

  // voa ate o balde encolhendo; devolve true quando chega
  _flyToBucket(f, dt, bucket) {
    const F = f.fly;
    F.t += dt / 0.35;
    const k = Math.min(1, F.t);
    f.root.position.lerpVectors(F.from, bucket, k * k);
    f.root.position.y += Math.sin(k * Math.PI) * 1.2;
    f.root.scale.setScalar(Math.max(0.01, 1 - k * 0.9));
    f.halo.material.opacity = 0.8 * (1 - k);
    if (k >= 1) {
      this.parent.remove(f.root);
      return true;
    }
    return false;
  }
}
