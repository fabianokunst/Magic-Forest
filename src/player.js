// First-person explorer: walks on the terrain, bumps into trees and houses, can fly.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { PLAY_RADIUS } from './world/layout.js';

const EYE_HEIGHT = 1.7;
const BODY_RADIUS = 0.4;
const WALK_SPEED = 4.5;
const RUN_SPEED = 9;
const FLY_SPEED = 22;
const GRAVITY = 22;
const JUMP_SPEED = 7.5;
const GRID = 10;

export class Player {
  constructor(camera, dom, { heightAt, colliders }) {
    this.camera = camera;
    this.heightAt = heightAt;
    this.controls = new PointerLockControls(camera, dom);
    this.keys = new Set();
    this.vy = 0;
    this.onGround = false;
    this.flying = false;
    this.forward = new THREE.Vector3();

    // Spatial hash of circular colliders, so each frame only checks nearby ones.
    this.grid = new Map();
    for (const c of colliders) {
      const key = `${Math.floor(c.x / GRID)},${Math.floor(c.z / GRID)}`;
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(c);
    }

    addEventListener('keydown', (e) => this.keys.add(e.code));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  toggleFly() {
    this.flying = !this.flying;
    this.vy = 0;
  }

  update(dt) {
    if (!this.controls.isLocked) return;
    const k = this.keys;
    const p = this.camera.position;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const len = Math.hypot(fwd, right) || 1;
    const fast = k.has('ShiftLeft') || k.has('ShiftRight');

    if (this.flying) {
      const speed = FLY_SPEED * (fast ? 2.5 : 1) * dt;
      this.camera.getWorldDirection(this.forward);
      p.addScaledVector(this.forward, (fwd / len) * speed);
      this.controls.moveRight((right / len) * speed);
      p.y += ((k.has('Space') ? 1 : 0) - (k.has('KeyC') || k.has('ControlLeft') ? 1 : 0)) * speed;
    } else {
      const speed = (fast ? RUN_SPEED : WALK_SPEED) * dt;
      this.controls.moveForward((fwd / len) * speed);
      this.controls.moveRight((right / len) * speed);
      this.collide(p);
    }

    const d = Math.hypot(p.x, p.z);
    if (d > PLAY_RADIUS) {
      p.x *= PLAY_RADIUS / d;
      p.z *= PLAY_RADIUS / d;
    }

    const ground = this.heightAt(p.x, p.z) + EYE_HEIGHT;
    if (this.flying) {
      p.y = Math.max(p.y, ground);
      return;
    }
    if (k.has('Space') && this.onGround) this.vy = JUMP_SPEED;
    this.vy -= GRAVITY * dt;
    p.y += this.vy * dt;
    // Stick to the ground when walking downhill instead of hopping off every bump.
    if (p.y <= ground || (this.onGround && this.vy <= 0 && p.y - ground < 0.35)) {
      p.y = ground;
      this.vy = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }

  collide(p) {
    const gx = Math.floor(p.x / GRID);
    const gz = Math.floor(p.z / GRID);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const c of this.grid.get(`${gx + i},${gz + j}`) ?? []) {
          const dx = p.x - c.x;
          const dz = p.z - c.z;
          const dist = Math.hypot(dx, dz);
          const min = c.r + BODY_RADIUS;
          if (dist < min && dist > 1e-6) {
            p.x = c.x + (dx / dist) * min;
            p.z = c.z + (dz / dist) * min;
          }
        }
      }
    }
  }
}
