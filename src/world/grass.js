// Instanced grass tufts from the four grass cards in House.blend.
import * as THREE from 'three';
import { PLAY_RADIUS, clearingDistance, pathDistance } from './layout.js';
import { dirtAt, heightAt, noise } from './terrain.js';
import { instanceChunks } from './instancing.js';

export const GRASS_CHUNK = 30;

export function createGrass(model, rand, count = 110000) {
  // Normalize every card to 1 m tall, with normals pointing up so tufts shade like the ground.
  const variants = [];
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const geo = obj.geometry.clone();
    geo.computeBoundingBox();
    const h = geo.boundingBox.max.y - geo.boundingBox.min.y;
    geo.scale(1 / h, 1 / h, 1 / h);
    const normals = geo.attributes.normal;
    for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geo, obj.material));
    variants.push(group);
  });

  const lists = variants.map(() => []);
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const radius = PLAY_RADIUS + 15;
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 4; tries++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    if (dirtAt(cx, cz) > 0.35) continue;
    // Sparse on the forest floor, dense in meadows around clearings and along paths.
    let w = 0.15 + 0.15 * noise.noise(cx / 12, cz / 12);
    if (clearingDistance(cx, cz) < 6) w += 0.8;
    if (pathDistance(cx, cz) < 6) w += 0.5;
    if (rand() > w) continue;
    // A tuft: several cards around one spot, taller in the middle.
    const tuft = 5 + Math.floor(rand() * 7);
    const size = 0.3 + rand() * 0.3;
    for (let i = 0; i < tuft; i++) {
      const ta = rand() * Math.PI * 2;
      const tr = Math.sqrt(rand()) * 0.55;
      const x = cx + Math.cos(ta) * tr;
      const z = cz + Math.sin(ta) * tr;
      const s = size * (1.15 - tr * 0.8) * (0.8 + rand() * 0.4);
      const m = new THREE.Matrix4().compose(
        pos.set(x, heightAt(x, z) - 0.03, z),
        rot.setFromAxisAngle(up, rand() * Math.PI * 2),
        scl.set(s * 1.3, s, s * 1.3),
      );
      lists[Math.floor(rand() * lists.length)].push(m);
    }
    placed += tuft;
  }

  return variants.flatMap((src, i) => instanceChunks(src, lists[i], { chunkSize: GRASS_CHUNK, castShadow: false }));
}
