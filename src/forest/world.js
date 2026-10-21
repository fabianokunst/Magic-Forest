import * as THREE from 'three';
import { FOLIAGE, prepareModels, windUniforms } from './materials.js';
import { mulberry32 } from './layout.js';
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

    // copa de cada arvore (altura do centro e raio), medida nas folhas do modelo
    const canopy = {};
    for (const name of ['tree_autumn', 'pine', 'tree_twisted']) {
      const box = new THREE.Box3();
      models[name].updateMatrixWorld(true);
      models[name].traverse((o) => {
        if (o.isMesh && FOLIAGE.has(o.material.name)) box.expandByObject(o);
      });
      const size = box.getSize(new THREE.Vector3());
      canopy[name] = { y: box.getCenter(new THREE.Vector3()).y, r: Math.max(size.x, size.z) / 2 };
    }
    this.trees = forest.trees.map((t) => ({
      ...t,
      canopyY: t.y + canopy[t.model].y * t.s,
      canopyR: canopy[t.model].r * t.s,
    }));

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
    if (b) {
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
      if (!blocked && p.y < g + c.h && Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.45) blocked = true;
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
