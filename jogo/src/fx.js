import * as THREE from 'three';

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function makeGlowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, fog: false,
  }));
  s.scale.setScalar(size);
  return s;
}

// uScale converte tamanho em metros para pixels (atualizado no resize)
export const pointUniforms = { uScale: { value: 600 } };

export function makePointsMaterial(blending, softness = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: pointUniforms.uScale },
    vertexShader: /* glsl */ `
      uniform float uScale;
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(0.05, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(smoothstep(1.0, 0.0, r), ${softness.toFixed(2)}) * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
    blending,
    transparent: true,
    depthWrite: false,
  });
}

// Conjunto de pontos com atributos por ponto, reescrito a cada frame.
export class PointBuffer {
  constructor(scene, max, blending, softness = 1) {
    this.max = max;
    this.count = 0;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    const attr = (name, arr, n) => {
      const a = new THREE.BufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(name, a);
    };
    attr('position', this.pos, 3);
    attr('aColor', this.col, 3);
    attr('aSize', this.size, 1);
    attr('aAlpha', this.alpha, 1);
    this.points = new THREE.Points(this.geo, makePointsMaterial(blending, softness));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  begin() {
    this.count = 0;
  }

  push(x, y, z, r, g, b, size, alpha) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.size[i] = size;
    this.alpha[i] = alpha;
  }

  end() {
    this.geo.setDrawRange(0, this.count);
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

// Particulas de vida curta (faiscas, fumaca, poeira).
export class ParticlePool {
  constructor(scene, max, blending, softness = 1) {
    this.buf = new PointBuffer(scene, max, blending, softness);
    this.list = [];
    this.max = max;
  }

  emit(o) {
    if (this.list.length >= this.max) return;
    this.list.push({
      x: o.x, y: o.y, z: o.z,
      vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: 0, max: o.life || 1,
      s0: o.s0 ?? 0.1, s1: o.s1 ?? o.s0 ?? 0.1,
      r: o.r ?? 1, g: o.g ?? 1, b: o.b ?? 1,
      a0: o.a0 ?? 1, a1: o.a1 ?? 0,
      drag: o.drag ?? 1, grav: o.grav ?? 0,
    });
  }

  burst(n, fn) {
    for (let i = 0; i < n; i++) this.emit(fn(i));
  }

  clear() {
    this.list.length = 0;
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life += dt;
      if (p.life >= p.max) {
        L[i] = L[L.length - 1];
        L.pop();
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    const b = this.buf;
    b.begin();
    for (const p of L) {
      const k = p.life / p.max;
      b.push(p.x, p.y, p.z, p.r, p.g, p.b, p.s0 + (p.s1 - p.s0) * k, p.a0 + (p.a1 - p.a0) * k);
    }
    b.end();
  }
}

// Anel que se expande no chao (rugido, lanterna acesa).
export class Rings {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2);
    this.list = [];
  }

  spawn(x, z, radius, color, dur = 0.6, y = 0.05) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.set(x, y, z);
    this.scene.add(m);
    this.list.push({ m, t: 0, dur, radius });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        this.scene.remove(r.m);
        r.m.material.dispose();
        this.list.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      r.m.scale.setScalar(0.2 + e * r.radius);
      r.m.material.opacity = (1 - k) * 0.9;
    }
  }
}
