import * as THREE from 'three';
import { FOLIAGE, prepareModels, windUniforms } from './materials.js';
import { CLEARINGS, mulberry32 } from './layout.js';
import { createTerrain, heightAt } from './terrain.js';
import { createSky } from './sky.js';
import { createForest, TREE_CHUNK } from './trees.js';
import { createGrass, GRASS_CHUNK } from './grass.js';
import { placeProps } from './props.js';
import { createFireflies } from './fireflies.js';
import { Atmosphere } from './atmosphere.js';
import { ChunkCuller } from './instancing.js';
import { Ogre } from '../core/ogre.js';

// A casinha do ogro foi modelada menor; na floresta ela (e o ogro) aparecem 2,5x maiores.
export const OGRE_SCALE = 2.5;
const GRID = 10;

// Cenario das fases 2 e 3: terreno, arvores, grama, casas, ceu e luz do dia.
// E montado uma vez so; cada fase poe os seus personagens e define o limite da area (bound).
export class ForestWorld {
  constructor({ renderer, assets }) {
    this.renderer = renderer;
    const scene = (this.scene = new THREE.Scene());
    const models = assets.forest.models;
    const tex = assets.forest.textures;
    const glowMaterials = prepareModels(models);

    const rand = mulberry32(2024);
    this.terrain = createTerrain(
      { grass: tex.terrain_grass, floor: tex.terrain_floor, dirt: tex.terrain_dirt },
      renderer.capabilities.getMaxAnisotropy(),
    );
    this.sky = createSky(tex.sky);
    const forest = createForest(models, rand);
    const grass = createGrass(models.grass, rand);
    const props = placeProps(models);
    this.fireflies = createFireflies(rand);
    scene.add(this.terrain, this.sky, props.group, this.fireflies, ...forest.chunks, ...grass);

    this.culler = new ChunkCuller();
    this.culler.add(forest.chunks, 200, TREE_CHUNK);
    this.culler.add(grass, 65, GRASS_CHUNK);

    this.atmosphere = new Atmosphere({
      scene, renderer, sky: this.sky, fireflies: this.fireflies, glowMaterials, lamps: props.lamps,
    });

    // tabela espacial dos obstaculos: cada consulta so olha as celulas vizinhas
    this.colliders = [...forest.colliders, ...props.colliders];
    this.grid = new Map();
    for (const c of this.colliders) {
      const key = this._key(Math.floor(c.x / GRID), Math.floor(c.z / GRID));
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(c);
    }

    // copa de cada arvore (altura do centro, meia altura e raio), medida nas folhas do modelo
    const canopy = {};
    for (const name of ['tree_autumn', 'pine', 'tree_twisted']) {
      const box = new THREE.Box3();
      models[name].updateMatrixWorld(true);
      models[name].traverse((o) => {
        if (o.isMesh && FOLIAGE.has(o.material.name)) box.expandByObject(o);
      });
      const size = box.getSize(new THREE.Vector3());
      canopy[name] = { y: box.getCenter(new THREE.Vector3()).y, hy: size.y / 2, r: Math.max(size.x, size.z) / 2 };
    }
    // formato real dos troncos (e galhos) em fatias de 1 m de altura, para a camera nao entrar neles
    const slices = {};
    const v = new THREE.Vector3();
    for (const name of Object.keys(canopy)) {
      const buckets = [];
      models[name].traverse((o) => {
        if (!o.isMesh || FOLIAGE.has(o.material.name)) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          (buckets[Math.max(0, Math.floor(v.y))] ??= []).push(v.x, v.z);
        }
      });
      slices[name] = Array.from(buckets, (b) => {
        if (!b) return null;
        const n = b.length / 2;
        let cx = 0, cz = 0;
        for (let i = 0; i < n; i++) { cx += b[i * 2]; cz += b[i * 2 + 1]; }
        cx /= n;
        cz /= n;
        const d = [];
        for (let i = 0; i < n; i++) d.push(Math.hypot(b[i * 2] - cx, b[i * 2 + 1] - cz));
        d.sort((a, b2) => a - b2);
        return { x: cx, z: cz, r: d[Math.floor(0.85 * (n - 1))] }; // ignora as pontas dos galhos
      });
    }
    this.trees = forest.trees.map((t, i) => {
      const tree = {
        ...t,
        canopyY: t.y + canopy[t.model].y * t.s,
        canopyR: canopy[t.model].r * t.s,
        canopyH: canopy[t.model].hy * t.s,
        slices: slices[t.model],
      };
      forest.colliders[i].tree = tree;
      return tree;
    });

    // casas: tambem fazem sombra no chao
    this.houses = [
      { x: CLEARINGS.cabin.x, z: CLEARINGS.cabin.z, r: 4.2, h: 7 },
      { x: CLEARINGS.cottage.x, z: CLEARINGS.cottage.z, r: 4.5, h: 7 },
    ];

    this.ogre = new Ogre(assets.ogre, scene, { scale: OGRE_SCALE, shadows: true });
    this.bound = null;
    this.onResize();
  }

  _key(i, j) {
    return i * 4096 + j;
  }

  heightAt(x, z) {
    return heightAt(x, z);
  }

  // chama fn(c) para cada obstaculo perto de (x, z)
  forNear(x, z, fn) {
    const gx = Math.floor(x / GRID), gz = Math.floor(z / GRID);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const cell = this.grid.get(this._key(gx + i, gz + j));
        if (cell) for (const c of cell) fn(c);
      }
    }
  }

  // espaco livre de obstaculos (com folga pad)
  isFree(x, z, pad = 0) {
    let free = true;
    this.forNear(x, z, (c) => {
      if (free && Math.hypot(x - c.x, z - c.z) < c.r + pad) free = false;
    });
    return free;
  }

  collide(p, radius) {
    this.forNear(p.x, p.z, (c) => {
      const dx = p.x - c.x, dz = p.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    });
    const b = this.bound;
    if (b?.clamp) {
      b.clamp(p); // area com outro formato (a faixa em volta da trilha, na fase 4)
    } else if (b) {
      const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
      if (d > b.r) {
        p.x = b.x + (dx / d) * b.r;
        p.z = b.z + (dz / d) * b.r;
      }
    }
  }

  // a camera nao entra no chao, nos troncos nem nas casas
  cameraBlocked(p) {
    const g = heightAt(p.x, p.z);
    if (p.y < g + 0.3) return true;
    let blocked = false;
    this.forNear(p.x, p.z, (c) => {
      if (blocked) return;
      const t = c.tree;
      if (!t) {
        if (p.y < g + c.h && Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.45) blocked = true;
        return;
      }
      // fatia do tronco na altura da camera, girada e escalada como a arvore
      const sl = t.slices[Math.floor((p.y - t.y) / t.s)];
      if (!sl) return;
      const cos = Math.cos(t.rot), sin = Math.sin(t.rot);
      const wx = t.x + (sl.x * cos + sl.z * sin) * t.s;
      const wz = t.z + (-sl.x * sin + sl.z * cos) * t.s;
      if (Math.hypot(p.x - wx, p.z - wz) < sl.r * t.s + 0.4) blocked = true;
    });
    return blocked;
  }

  onResize() {
    const u = this.fireflies.material.uniforms;
    u.uSize.value = 60 * this.renderer.getPixelRatio() * (innerHeight / 900);
  }

  update(dt, time, cameraPos, focus) {
    windUniforms.uTime.value = time;
    this.sky.material.uniforms.uTime.value = time;
    this.fireflies.material.uniforms.uTime.value = time;
    this.sky.position.copy(cameraPos);
    this.culler.update(cameraPos);
    this.atmosphere.update(dt, focus);
  }
}
