import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;

// Camera em terceira pessoa, levemente por cima do ombro. `scale` acompanha o tamanho do ogro no cenario.
export class CameraRig {
  constructor(camera, scale = 1) {
    this.camera = camera;
    this.s = scale;
    this.yaw = 0;
    this.pitch = 0.28;
    this.dist = 2.7 * scale;
    this.curDist = this.dist;
    this.shake = 0;
    this.target = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  forward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  _focus(out, focus) {
    const s = 0.22 * this.s;
    return out.set(focus.x + Math.cos(this.yaw) * s, focus.y + 0.55 * this.s, focus.z - Math.sin(this.yaw) * s);
  }

  snap(focus) {
    this._focus(this.target, focus);
  }

  update(dt, input, focus, world, orbit) {
    const S = this.s;
    if (orbit) {
      this.yaw += dt * 0.12;
      this.pitch += (0.32 - this.pitch) * dt;
    } else {
      this.yaw -= input.mouseDX * 0.0026;
      this.pitch = clamp(this.pitch + input.mouseDY * 0.0022, -0.2, 1.1);
      this.dist = clamp(this.dist + input.wheel * 0.3 * S, 1.5 * S, 5 * S);
    }
    this.target.lerp(this._focus(this._p, focus), 1 - Math.exp(-dt * 10));

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const pos = this.camera.position;
    const place = (d) => pos.set(
      this.target.x + Math.sin(this.yaw) * cp * d,
      this.target.y + sp * d,
      this.target.z + Math.cos(this.yaw) * cp * d,
    );
    // anda do ogro ate a camera: o primeiro obstaculo no caminho limita a distancia (nada fica na frente)
    let allowed = 0.6 * S;
    for (let d = allowed; d <= this.dist + 1e-6; d += 0.1 * S) {
      if (world.cameraBlocked(place(d))) break;
      allowed = d;
    }
    this.curDist = allowed < this.curDist ? allowed : this.curDist + (allowed - this.curDist) * Math.min(1, dt * 4);
    place(this.curDist);
    pos.y = Math.max(pos.y, world.heightAt(pos.x, pos.z) + 0.12 * S);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      const s = this.shake * this.shake * 0.12 * S;
      pos.x += (Math.random() - 0.5) * s;
      pos.y += (Math.random() - 0.5) * s;
      pos.z += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.target);
  }
}
