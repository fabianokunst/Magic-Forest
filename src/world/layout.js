// World layout: size, clearings, paths and small math helpers shared by every system.
import * as THREE from 'three';

export const WORLD_SIZE = 440; // terrain is WORLD_SIZE x WORLD_SIZE meters, centered on the origin
export const PLAY_RADIUS = 140; // the player can't walk past this; a ridge rises beyond it

// r: radius kept free of trees; dirt: radius of the bare-ground patch in the middle
export const CLEARINGS = {
  cabin: { x: 0, z: 0, r: 20, dirt: 9 },
  cottage: { x: 76, z: 64, r: 13, dirt: 7 },
  glade: { x: -74, z: -96, r: 11, dirt: 0 },
};

const PATH_POINTS = {
  toCottage: [[0, 8], [2, 20], [12, 31], [28, 37], [45, 41], [58, 48], [67, 56]],
  toGlade: [[-6, 3], [-20, 1], [-36, -8], [-52, -22], [-62, -42], [-67, -64], [-72, -88]],
};

// Smoothed paths as dense [x, z] polylines (~1.5 m between points).
export const PATHS = Object.fromEntries(
  Object.entries(PATH_POINTS).map(([name, pts]) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const n = Math.ceil(curve.getLength() / 1.5);
    return [name, curve.getSpacedPoints(n).map((p) => [p.x, p.z])];
  }),
);

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

// Distance-to-nearest-path field, precomputed on a 2 m grid and sampled bilinearly.
const CELL = 2;
const N = WORLD_SIZE / CELL + 1;
const field = new Float32Array(N * N);
{
  const segs = [];
  for (const pts of Object.values(PATHS)) {
    for (let i = 0; i < pts.length - 1; i++) segs.push([...pts[i], ...pts[i + 1]]);
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -WORLD_SIZE / 2 + i * CELL;
      const z = -WORLD_SIZE / 2 + j * CELL;
      let d = Infinity;
      for (const s of segs) d = Math.min(d, segmentDistance(x, z, s[0], s[1], s[2], s[3]));
      field[j * N + i] = d;
    }
  }
}

export function pathDistance(x, z) {
  const fx = Math.min(N - 1.001, Math.max(0, (x + WORLD_SIZE / 2) / CELL));
  const fz = Math.min(N - 1.001, Math.max(0, (z + WORLD_SIZE / 2) / CELL));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const a = field[j * N + i];
  const b = field[j * N + i + 1];
  const c = field[(j + 1) * N + i];
  const d = field[(j + 1) * N + i + 1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

// Distance from (x, z) to the edge of the nearest clearing (negative inside it).
export function clearingDistance(x, z) {
  let d = Infinity;
  for (const c of Object.values(CLEARINGS)) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - c.r);
  return d;
}
