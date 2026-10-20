import * as THREE from 'three';
import { CONFIG, LANTERN_SPOTS } from './config.js';
import { makeGlowSprite } from './fx.js';

const Y = new THREE.Vector3(0, 1, 0);

export class Lanterns {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    const L = world.level.lamppost;
    this.offset = new THREE.Vector3().fromArray(L.lantern_offset);
    this.ringGeo = new THREE.RingGeometry(0.985, 1, 64).rotateX(-Math.PI / 2);

    const original = world.root.getObjectByName('Lamppost');
    this._add(original, original.position.x, original.position.z, original.rotation.y, 1);
    for (const [x, z] of LANTERN_SPOTS) {
      const node = original.clone(true);
      // braco do poste apontando para a casa
      const d = new THREE.Vector2(-x, -z).normalize();
      const o = new THREE.Vector2(this.offset.x, this.offset.z).normalize();
      const yaw = Math.atan2(-d.y, d.x) - Math.atan2(-o.y, o.x);
      world.root.add(node);
      this._add(node, x, z, yaw, 0);
    }
  }

  _add(node, x, z, yaw, fuel) {
    node.position.set(x, 0, z);
    node.rotation.y = yaw;
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb060, emissiveIntensity: 0 });
    glowMat.name = 'light'; // os clones do poste copiam o material do original; o nome permite trocar de novo
    node.traverse((o) => {
      if (o.isMesh && o.material && o.material.name === 'light') o.material = glowMat;
    });
    const head = this.offset.clone().applyAxisAngle(Y, yaw).add(new THREE.Vector3(x, 0, z));
    const light = new THREE.PointLight(0xff9a45, 0, 6.5, 2);
    light.position.copy(head);
    this.scene.add(light);
    const halo = makeGlowSprite(0xffa860, 1, 0);
    halo.position.copy(head);
    this.scene.add(halo);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
      color: 0xffb35a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    ring.position.set(head.x, 0.04, head.z);
    this.scene.add(ring);
    this.world.addCircle(x, z, 0.12);
    this.list.push({
      id: this.list.length, node, head, light, halo, ring, glowMat,
      x: head.x, z: head.z, postX: x, postZ: z,
      fuel, startFuel: fuel, phase: Math.random() * 10,
    });
  }

  reset() {
    for (const l of this.list) l.fuel = l.startFuel;
  }

  radius(l) {
    return l.fuel > 0.01 ? CONFIG.lantern.baseRadius + CONFIG.lantern.extraRadius * l.fuel : 0;
  }

  litCount() {
    return this.list.filter((l) => l.fuel > 0.01).length;
  }

  nearest(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const l of this.list) {
      const d = Math.hypot(x - l.postX, z - l.postZ);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  // a luz que cobre o ponto (para dano nas sombras e zona segura)
  lightAt(x, z) {
    let best = 0;
    for (const l of this.list) {
      const r = this.radius(l);
      if (r <= 0) continue;
      const d = Math.hypot(x - l.x, z - l.z);
      if (d < r) best = Math.max(best, (0.4 + 0.6 * l.fuel) * (1 - 0.5 * d / r));
    }
    return best;
  }

  feed(l, available) {
    const need = Math.ceil((1 - l.fuel) / CONFIG.lantern.perFirefly - 1e-6);
    const used = Math.max(0, Math.min(available, need));
    l.fuel = Math.min(1, l.fuel + used * CONFIG.lantern.perFirefly);
    return used;
  }

  drain(l, amount) {
    const was = l.fuel > 0.01;
    l.fuel = Math.max(0, l.fuel - amount);
    return was && l.fuel <= 0.01;
  }

  update(dt, time, active) {
    const events = [];
    for (const l of this.list) {
      if (active && l.fuel > 0.01) {
        l.fuel -= CONFIG.lantern.decay * dt;
        if (l.fuel <= 0.01) {
          l.fuel = 0;
          events.push({ type: 'out', lantern: l });
        }
      }
      const k = l.fuel > 0.01 ? 0.35 + 0.65 * l.fuel : 0;
      const fl = 1 + 0.07 * Math.sin(time * 13 + l.phase) + 0.04 * Math.sin(time * 7.3 + l.phase * 2);
      l.light.intensity = 5 * k * fl;
      l.glowMat.emissiveIntensity = 0.08 + 7 * k * fl;
      l.halo.material.opacity = 0.75 * k;
      l.halo.scale.setScalar(0.6 + 0.9 * k * fl);
      const r = this.radius(l);
      l.ring.visible = r > 0;
      l.ring.scale.setScalar(Math.max(0.01, r));
      l.ring.material.opacity = 0.03 + 0.06 * l.fuel;
    }
    return events;
  }
}
