// Chunked GPU instancing: one InstancedMesh per (chunk, model part), so three.js can
// frustum-cull by area and far chunks can be hidden entirely.
import * as THREE from 'three';

export function instanceChunks(source, transforms, { chunkSize = 60, castShadow = true, receiveShadow = true } = {}) {
  source.updateMatrixWorld(true);
  const parts = [];
  source.traverse((obj) => obj.isMesh && parts.push(obj));

  const buckets = new Map();
  for (const m of transforms) {
    const key = `${Math.floor(m.elements[12] / chunkSize)},${Math.floor(m.elements[14] / chunkSize)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m);
  }

  const tmp = new THREE.Matrix4();
  const chunks = [];
  for (const list of buckets.values()) {
    const group = new THREE.Group();
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, tmp.multiplyMatrices(m, part.matrixWorld)));
      mesh.computeBoundingSphere();
      mesh.castShadow = castShadow && part.castShadow;
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    const center = new THREE.Vector3();
    for (const m of list) center.add(new THREE.Vector3().setFromMatrixPosition(m));
    center.divideScalar(list.length).setY(0);
    group.userData.center = center;
    chunks.push(group);
  }
  return chunks;
}

// Hides chunks farther than their max distance from the camera (fog hides them anyway).
export class ChunkCuller {
  items = [];

  add(chunks, maxDistance, chunkSize) {
    const pad = chunkSize * 0.75;
    for (const chunk of chunks) this.items.push({ chunk, max: maxDistance + pad });
  }

  update(position) {
    for (const { chunk, max } of this.items) {
      const c = chunk.userData.center;
      chunk.visible = Math.hypot(c.x - position.x, c.z - position.z) < max;
    }
  }
}
