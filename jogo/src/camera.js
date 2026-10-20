import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;

// Camera em terceira pessoa, levemente por cima do ombro.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.28;
    this.dist = 2.7;
    this.curDist = 2.7;
    this.shake = 0;
    this.target = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  forward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  _focus(out, focus) {
    const s = 0.22;
    return out.set(focus.x + Math.cos(this.yaw) * s, focus.y + 0.55, focus.z - Math.sin(this.yaw) * s);
  }

  snap(focus) {
    this._focus(this.target, focus);
  }

  _blocked(p, world) {
    if (p.y < 3.2 && world.insideHouse(p.x, p.z, 0.45)) return true;
    for (const t of world.trees) {
      if (p.y < t.h * 0.45 && Math.hypot(p.x - t.x, p.z - t.z) < t.col + 0.15) return true;
    }
    // postes e demais obstaculos finos
    for (const c of world.circles) {
      if (c.r < 0.3 && p.y < 1.5 && Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.15) return true;
    }
    return false;
  }

  update(dt, input, focus, world, orbit) {
    if (orbit) {
      this.yaw += dt * 0.12;
      this.pitch += (0.32 - this.pitch) * dt;
    } else {
      this.yaw -= input.mouseDX * 0.0026;
      this.pitch = clamp(this.pitch + input.mouseDY * 0.0022, -0.2, 1.1);
      this.dist = clamp(this.dist + input.wheel * 0.3, 1.5, 5);
    }
    this.target.lerp(this._focus(this._p, focus), 1 - Math.exp(-dt * 10));

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const pos = this.camera.position;
    const place = (d) => pos.set(
      this.target.x + Math.sin(this.yaw) * cp * d,
      this.target.y + sp * d,
      this.target.z + Math.cos(this.yaw) * cp * d,
    );
    let allowed = this.dist;
    for (; allowed > 0.6; allowed -= 0.1) {
      if (!this._blocked(place(allowed), world)) break;
    }
    this.curDist = allowed < this.curDist ? allowed : this.curDist + (allowed - this.curDist) * Math.min(1, dt * 4);
    place(this.curDist);
    pos.y = Math.max(pos.y, world.heightAt(pos.x, pos.z) + 0.12);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      const s = this.shake * this.shake * 0.12;
      pos.x += (Math.random() - 0.5) * s;
      pos.y += (Math.random() - 0.5) * s;
      pos.z += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.target);
  }
}
