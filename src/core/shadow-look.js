import * as THREE from 'three';
import { PointBuffer } from './fx.js';

const BLOBS = 9;
const DIE_TIME = 0.6;

// Visual das Sombras: nuvem escura de bolhas, aura roxa e olhos brilhantes. Usado nas tres fases.
// Cada sombra da lista informa:
//   x, z, y (chao)  scale (1 = normal)  alpha  phase (aleatorio)  fx, fz (para onde olha)
//   flash (levou dano)  burn (queimando)  sun (0..1, luz do dia)  eyes (1 abertos, 0 fechados)
//   shiver (0..1, tremendo)  state === 'dying' com t (sumindo)  state === 'emerge' (saindo do chao)
// `unit` converte para o tamanho do cenario (1 na casinha, maior na floresta).
export class ShadowLook {
  constructor(scene, max, unit = 1) {
    this.unit = unit;
    // ordem: aura (aditiva) -> corpo escuro por cima -> olhos
    this.aura = new PointBuffer(scene, max, THREE.AdditiveBlending, 1.5);
    this.body = new PointBuffer(scene, max * BLOBS, THREE.NormalBlending, 1.2);
    this.glow = new PointBuffer(scene, max * 6, THREE.AdditiveBlending, 1.5);
    this.aura.points.renderOrder = 1;
    this.body.points.renderOrder = 2;
    this.glow.points.renderOrder = 4;
  }

  set visible(v) {
    this.aura.points.visible = this.body.points.visible = this.glow.points.visible = v;
  }

  draw(list, time, cam) {
    const U = this.unit;
    const b = this.body, g = this.glow, au = this.aura;
    b.begin();
    g.begin();
    au.begin();
    for (const s of list) {
      let a = s.alpha;
      let sc = s.scale * U;
      if (s.state === 'dying') {
        const k = Math.min(1, s.t / DIE_TIME);
        a *= 1 - k;
        sc *= 1 + k * 0.8;
      }
      if (a <= 0.003) continue;
      const base = s.y ?? 0;
      const rise = s.state === 'emerge' ? (1 - s.alpha) * 0.4 * U : 0;
      const sh = (s.shiver ?? 0) * 0.035 * U;
      const x = s.x + (sh ? (Math.random() - 0.5) * sh : 0);
      const z = s.z + (sh ? (Math.random() - 0.5) * sh : 0);
      const cy = base + 0.42 * sc + Math.sin(time * 2.1 + s.phase) * 0.06 * U - rise;
      const flick = s.burn > 0 ? 0.55 + 0.45 * Math.random() : 1;
      const f = s.flash;
      const sun = s.sun ?? 0;
      au.push(x, cy, z, 0.3 + sun * 1.2, 0.05 + sun * 0.5, 0.5 - sun * 0.4, 1.7 * sc, (0.3 + sun * 0.25) * a);
      for (let k = 0; k < BLOBS; k++) {
        const ang = s.phase + k * 2.399 + time * (0.7 + (k % 3) * 0.35);
        const rad = 0.13 * sc * (1 + 0.3 * Math.sin(time * 2.3 + k));
        const yy = cy + (k / BLOBS - 0.4) * 0.45 * sc + 0.05 * U * Math.sin(time * 3 + k);
        const size = (0.36 + 0.12 * Math.sin(time * 2.7 + k * 1.7)) * sc;
        b.push(x + Math.cos(ang) * rad, yy, z + Math.sin(ang) * rad,
          0.03 + f * 0.7 + sun * 0.22, 0.01 + f * 0.4 + sun * 0.08, 0.05 + f * 0.8, size, 0.92 * a * flick);
      }
      // olhos so aparecem quando a sombra olha para a camera
      const toCx = cam.x - x, toCz = cam.z - z, tl = Math.hypot(toCx, toCz) || 1;
      const facing = (s.fx * toCx + s.fz * toCz) / tl;
      const blink = Math.sin(time * 0.9 + s.phase * 3) > 0.97 ? 0.1 : 1;
      const open = s.eyes ?? 1;
      const ea = a * THREE.MathUtils.smoothstep(facing, -0.3, 0.2) * (open > 0.5 ? blink : 1);
      if (ea > 0.01) {
        const lx = -s.fz, lz = s.fx;
        const ey = cy + 0.1 * sc;
        const ex = x + s.fx * 0.22 * sc, ez = z + s.fz * 0.22 * sc;
        for (const side of [-1, 1]) {
          const cx = ex + lx * 0.07 * side * sc, cz = ez + lz * 0.07 * side * sc;
          if (open > 0.5) {
            g.push(cx, ey, cz, 2.4, 0.35, 1.7, 0.085 * sc * (0.6 + 0.4 * open), ea);
          } else {
            // olhinhos fechados: um tracinho
            for (const o of [-1, 0, 1]) {
              g.push(cx + lx * o * 0.026 * sc, ey - 0.012 * sc - Math.abs(o) * 0.006 * sc, cz + lz * o * 0.026 * sc,
                2.4, 0.35, 1.7, 0.032 * sc, ea * 0.9);
            }
          }
        }
      }
    }
    b.end();
    g.end();
    au.end();
  }
}

export const SHADOW_DIE_TIME = DIE_TIME;
