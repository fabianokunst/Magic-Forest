import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
// angulos alternativos quando nao ha espaco atras do ogro: [quanto sobe, quanto gira para o lado]
const CAMERA_OPTIONS = [[0.35, 0], [0, 0.6], [0, -0.6], [0.7, 0], [0.35, 1.2], [0.35, -1.2], [0.35, 1.6], [0.35, -1.6]];

// Camera em terceira pessoa, levemente por cima do ombro. `scale` acompanha o tamanho do ogro no cenario.
export class CameraRig {
  constructor(camera, scale = 1) {
    this.camera = camera;
    this.s = scale;
    this.yaw = 0;
    this.pitch = 0.28;
    this.dist = 2.7 * scale;
    this.curDist = this.dist;
    this.offPitch = 0; // desvio temporario para achar espaco atras do ogro
    this.offYaw = 0;
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
    this.offPitch = this.offYaw = 0;
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

    const pos = this.camera.position;
    const place = (d, pitch, yaw) => {
      const cp = Math.cos(pitch);
      return pos.set(
        this.target.x + Math.sin(yaw) * cp * d,
        this.target.y + Math.sin(pitch) * d,
        this.target.z + Math.cos(yaw) * cp * d,
      );
    };
    // anda do ogro ate a camera: o primeiro obstaculo no caminho limita a distancia (nada fica na frente)
    const reach = (pitch, yaw) => {
      let allowed = 0;
      for (let d = 0.6 * S; d <= this.dist + 1e-6; d += 0.1 * S) {
        if (world.cameraBlocked(place(d, pitch, yaw))) break;
        allowed = d;
      }
      return allowed;
    };
    // sem espaco atras do ogro (de costas para uma parede ou tronco): procura um angulo melhor,
    // mais alto ou um pouco de lado, preferindo o que muda menos a visao
    let best = { dp: 0, dy: 0, a: reach(this.pitch, this.yaw) };
    if (best.a < this.dist * 0.7) {
      best.score = best.a;
      for (const [dp, dy] of CAMERA_OPTIONS) {
        const a = reach(Math.min(1.4, this.pitch + dp), this.yaw + dy);
        const score = a - (Math.abs(dy) * 0.25 + dp * 0.3) * S;
        if (score > best.score) best = { dp, dy, a, score };
      }
    }
    const k = Math.min(1, dt * 5);
    this.offPitch += (best.dp - this.offPitch) * k;
    this.offYaw += (best.dy - this.offYaw) * k;
    const allowed = Math.max(best.a, 0.6 * S);
    this.curDist = allowed < this.curDist ? allowed : this.curDist + (allowed - this.curDist) * Math.min(1, dt * 4);
    place(this.curDist, Math.min(1.4, this.pitch + this.offPitch), this.yaw + this.offYaw);
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
