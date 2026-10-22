import { CLEARINGS, PATHS } from '../forest/layout.js';
import { MOON } from './config.js';

// A trilha da cabana ate a Clareira da Lua: onde nascem as flores, onde fica o jardim e ate onde o ogro pode ir.
export const TRAIL = PATHS.toGlade;
const CUM = [0];
for (let i = 1; i < TRAIL.length; i++) {
  CUM.push(CUM[i - 1] + Math.hypot(TRAIL[i][0] - TRAIL[i - 1][0], TRAIL[i][1] - TRAIL[i - 1][1]));
}
export const TRAIL_LENGTH = CUM[CUM.length - 1];
export const GLADE = CLEARINGS.glade;
export const GLADE_LAMP = { x: GLADE.x + 1.5, z: GLADE.z }; // o poste da clareira (forest/props.js)

// ponto da trilha a d metros do comeco, com a direcao dela ali
export function trailAt(d) {
  let i = 1;
  while (i < CUM.length - 1 && CUM[i] < d) i++;
  const [ax, az] = TRAIL[i - 1], [bx, bz] = TRAIL[i];
  const len = CUM[i] - CUM[i - 1];
  const t = Math.min(1, Math.max(0, (d - CUM[i - 1]) / len));
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / len, dz: (bz - az) / len };
}

// ponto da trilha mais perto de (x, z): { x, z, d (distancia ate ela), along (metros desde o comeco) }
export function nearestOnTrail(x, z) {
  let best = { x: 0, z: 0, d: Infinity, along: 0 };
  for (let i = 1; i < TRAIL.length; i++) {
    const [ax, az] = TRAIL[i - 1], [bx, bz] = TRAIL[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { x: px, z: pz, d, along: CUM[i - 1] + t * (CUM[i] - CUM[i - 1]) };
  }
  return best;
}

// Area da fase: a clareira da cabana, a Clareira da Lua e uma faixa em volta da trilha.
// Usada como world.bound: clamp(p) traz de volta para dentro quem sai.
export class TrailBound {
  constructor(width) {
    this.width = width;
    this.circles = [
      { x: MOON.cabin.x, z: MOON.cabin.z, r: 24 },
      { x: GLADE.x, z: GLADE.z, r: 16 },
    ];
  }

  clamp(p) {
    let best = null, bd = Infinity;
    for (const c of this.circles) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d <= c.r) return;
      if (d - c.r < bd) {
        bd = d - c.r;
        best = { x: c.x + (dx / d) * c.r, z: c.z + (dz / d) * c.r };
      }
    }
    const q = nearestOnTrail(p.x, p.z);
    if (q.d <= this.width) return;
    if (q.d - this.width < bd) {
      const k = this.width / q.d;
      best = { x: q.x + (p.x - q.x) * k, z: q.z + (p.z - q.z) * k };
    }
    p.x = best.x;
    p.z = best.z;
  }
}

// onde nascem as flores: dos dois lados da trilha, alternando, e uma roda na Clareira da Lua
export function flowerSpots(world) {
  const F = MOON.flowers;
  const spots = [];
  for (let i = 0; i < F.trail; i++) {
    const t = trailAt(F.from + i * F.step);
    const side = i % 2 ? 1 : -1;
    for (const off of [F.side, F.side * 0.5, 0]) {
      const x = t.x - t.dz * side * off, z = t.z + t.dx * side * off;
      if (off === 0 || world.isFree(x, z, 0.8)) {
        spots.push([x, z]);
        break;
      }
    }
  }
  for (let i = 0; i < F.glade; i++) {
    const a = 0.9 + (i / F.glade) * Math.PI * 2;
    for (let r = 4.5 + (i % 2) * 1.5; r > 1; r -= 1) {
      const x = GLADE.x + Math.cos(a) * r, z = GLADE.z + Math.sin(a) * r;
      if (world.isFree(x, z, 0.8)) {
        spots.push([x, z]);
        break;
      }
    }
  }
  return spots;
}

// canteiros em volta da cabana, deixando livre a frente da porta (+z)
export function gardenSpots(n) {
  const spots = [];
  const c = MOON.cabin;
  for (let i = 0; i < n; i++) {
    const a = 0.45 + ((i + 0.5) / n) * (Math.PI * 2 - 0.9);
    const r = 6.3 + (i % 2) * 0.9;
    spots.push([c.x + Math.sin(a) * r, c.z + Math.cos(a) * r]);
  }
  return spots;
}
