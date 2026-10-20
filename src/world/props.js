// Places the cabin, the cottage and the lampposts; collects their colliders and lamp positions.
import * as THREE from 'three';
import { CLEARINGS, PATHS } from './layout.js';
import { heightAt } from './terrain.js';

const COTTAGE_SCALE = 2.5; // the ogre scene was modeled at a smaller scale
const LAMPPOST_SCALE = 2.4;

export function placeProps(models) {
  const group = new THREE.Group();
  const colliders = [];

  const add = (model, x, z, rotY, scale = 1, yOffset = 0) => {
    const obj = model.clone();
    obj.position.set(x, heightAt(x, z) + yOffset, z);
    obj.rotation.y = rotY;
    obj.scale.setScalar(scale);
    group.add(obj);
    return obj;
  };

  // Cabin: door faces +Z, toward the start of the path to the cottage.
  const cabin = CLEARINGS.cabin;
  add(models.cabin, cabin.x, cabin.z, 0, 1, -0.05);
  for (const [dx, dz] of [[-1.9, -1.6], [1.9, -1.6], [-1.9, 1.6], [1.9, 1.6]]) {
    colliders.push({ x: cabin.x + dx, z: cabin.z + dz, r: 2.6 });
  }
  colliders.push({ x: cabin.x, z: cabin.z + 5, r: 1 });

  // Cottage: turn its door toward where the path arrives.
  const cottage = CLEARINGS.cottage;
  const path = PATHS.toCottage;
  const [ex, ez] = path[path.length - 1];
  add(models.cottage, cottage.x, cottage.z, Math.atan2(ex - cottage.x, ez - cottage.z), COTTAGE_SCALE);
  colliders.push({ x: cottage.x, z: cottage.z, r: 3.6 });

  // Lampposts along the cottage path, alternating sides, lantern arm over the path.
  let side = 1;
  for (let i = 8; i < path.length - 3; i += 10) {
    const [x0, z0] = path[i - 1];
    const [x1, z1] = path[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const nx = (-(z1 - z0) / len) * side;
    const nz = ((x1 - x0) / len) * side;
    const x = path[i][0] + nx * 2.3;
    const z = path[i][1] + nz * 2.3;
    add(models.lamppost, x, z, Math.atan2(nz, -nx), LAMPPOST_SCALE);
    colliders.push({ x, z, r: 0.3 });
    side = -side;
  }
  const glade = CLEARINGS.glade;
  add(models.lamppost, glade.x + 1.5, glade.z, 0, LAMPPOST_SCALE);
  colliders.push({ x: glade.x + 1.5, z: glade.z, r: 0.3 });

  group.updateMatrixWorld(true);
  const lamps = [];
  group.traverse((obj) => {
    if (obj.name.startsWith('lamp_')) lamps.push(obj.getWorldPosition(new THREE.Vector3()));
  });
  return { group, colliders, lamps };
}
