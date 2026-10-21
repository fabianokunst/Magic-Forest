// Scatters the three tree species over the terrain, avoiding clearings and paths.
import * as THREE from 'three';
import { CLEARINGS, PLAY_RADIUS, WORLD_SIZE, clearingDistance, pathDistance, smoothstep } from './layout.js';
import { heightAt, noise } from './terrain.js';
import { instanceChunks } from './instancing.js';

export const TREE_CHUNK = 60;

// trunk: collider radius at scale 1
const SPECIES = {
  autumn: { model: 'tree_autumn', scale: [0.9, 1.35], trunk: 0.7 },
  pine: { model: 'pine', scale: [1.3, 1.9], trunk: 0.45 },
  twisted: { model: 'tree_twisted', scale: [2.1, 2.8], trunk: 0.55 },
};

// Twisted red trees around the cottage, pines toward the north-west, autumn trees elsewhere.
function pickSpecies(x, z, rand) {
  const c = CLEARINGS.cottage;
  if (rand() < smoothstep(58, 26, Math.hypot(x - c.x, z - c.z))) return 'twisted';
  const pineBias = noise.noise(x / 80 + 11, z / 80) * 0.6 + (-x - z) / 260 + (rand() - 0.5) * 0.3;
  return pineBias > 0.05 ? 'pine' : 'autumn';
}

export function createForest(models, rand) {
  const placements = { autumn: [], pine: [], twisted: [] };
  const colliders = [];
  const trees = []; // kind, scale and base height of every tree (for canopy shade)
  const cell = 9.5;
  const half = WORLD_SIZE / 2 - 12;
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scl = new THREE.Vector3();

  // Jittered grid: one candidate per cell keeps trees evenly spaced but not in rows.
  for (let gz = -half; gz < half; gz += cell) {
    for (let gx = -half; gx < half; gx += cell) {
      const x = gx + rand() * cell;
      const z = gz + rand() * cell;
      const r = Math.hypot(x, z);
      if (r > half || clearingDistance(x, z) < 1.5 || pathDistance(x, z) < 4.5) continue;
      const density = 0.6 + 0.3 * noise.noise(x / 45, z / 45) + (r > PLAY_RADIUS ? 0.25 : 0);
      if (rand() > density) continue;

      const kind = pickSpecies(x, z, rand);
      const sp = SPECIES[kind];
      const s = sp.scale[0] + rand() * (sp.scale[1] - sp.scale[0]);
      // Sit on the lowest ground under the trunk so roots never float on slopes.
      const reach = sp.trunk * s * 1.2;
      const y = Math.min(
        heightAt(x, z), heightAt(x + reach, z), heightAt(x - reach, z), heightAt(x, z + reach), heightAt(x, z - reach),
      ) - 0.15;
      euler.set((rand() - 0.5) * 0.08, rand() * Math.PI * 2, (rand() - 0.5) * 0.08);
      placements[kind].push(new THREE.Matrix4().compose(pos.set(x, y, z), rot.setFromEuler(euler), scl.setScalar(s)));
      colliders.push({ x, z, r: sp.trunk * s, h: 4.5 });
      trees.push({ x, z, y, kind, model: sp.model, s, rot: euler.y });
    }
  }

  const chunks = Object.entries(placements).flatMap(([kind, list]) =>
    instanceChunks(models[SPECIES[kind].model], list, { chunkSize: TREE_CHUNK }),
  );
  const counts = Object.fromEntries(Object.entries(placements).map(([k, v]) => [k, v.length]));
  return { chunks, colliders, trees, counts };
}
