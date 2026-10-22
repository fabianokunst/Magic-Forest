import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PointBuffer, glowTexture } from './fx.js';

// Medidas na escala da casinha (fase 1). Em cenarios maiores o ogro e criado com `scale` e tudo acompanha.
const TUNING = {
  walk: 1.15,
  run: 2.3,
  radius: 0.2,
  turn: 12,
  accel: 10,
};
// velocidades (m/s) em que as animacoes nao escorregam
const WALK_NATURAL = 0.9;
const RUN_NATURAL = 1.5;
const LOOPS = ['Idle', 'Walk', 'Run', 'Celebrate'];

const clamp = THREE.MathUtils.clamp;
const smooth = (x) => THREE.MathUtils.smoothstep(x, 0, 1);

function dampAngle(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}

export class Ogre {
  // shadows: projeta sombra de verdade (floresta) em vez da mancha escura no chao (casinha)
  constructor(gltf, scene, { scale = 1, shadows = false } = {}) {
    this.s = scale;
    this.tuning = { ...TUNING };
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);
    this.model = cloneSkinned(gltf.scene);
    this.root.add(this.model);
    scene.add(this.root);
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = shadows;
    });

    this.mixer = new THREE.AnimationMixer(this.model);
    const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
    // arremesso so na parte de cima (braco esquerdo + giro do tronco) para jogar andando
    const upper = new Set(['Bone']);
    this.model.getObjectByName('Bone004').traverse((o) => upper.add(o.name));
    const throwUpper = clips.Throw.clone();
    throwUpper.name = 'ThrowUpper';
    throwUpper.tracks = throwUpper.tracks.filter((t) => upper.has(t.name.split('.')[0]));
    clips.ThrowUpper = throwUpper;

    this.actions = {};
    for (const [name, clip] of Object.entries(clips)) {
      const a = this.mixer.clipAction(clip);
      if (LOOPS.includes(name)) {
        a.setLoop(THREE.LoopRepeat);
        a.play();
        a.setEffectiveWeight(0);
      } else {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[name] = a;
    }
    this.actions.Idle.setEffectiveWeight(1);

    this.bucket = this.model.getObjectByName('Balde');
    this.applePile = this.model.getObjectByName('Macas');
    this.hand = this.model.getObjectByName('Bone008');

    this.orbColor = [0.55, 2.4, 1.0];
    this.bucketLight = new THREE.PointLight(0x7dffa8, 0, 2.4 * scale, 2);
    scene.add(this.bucketLight);
    this.orbs = new PointBuffer(scene, 16, THREE.AdditiveBlending, 1.6);

    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.3 * scale, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    this.blob.visible = !shadows;
    scene.add(this.blob);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.knock = new THREE.Vector2();
    this.yaw = 0;
    this.speed = 0;
    this.lock = 0;
    this.invuln = 0;
    this.oneShot = null;
    this.mode = 'play';
    this.modeW = 0;
    this.faceDir = { x: 0, z: 1 };
    this.faceT = 0;
    this._v = new THREE.Vector3();
  }

  get walkSpeed() {
    return this.tuning.walk * this.s;
  }

  get runSpeed() {
    return this.tuning.run * this.s;
  }

  get radius() {
    return this.tuning.radius * this.s;
  }

  place(x, z, yaw, y = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0);
    this.knock.set(0, 0);
    this.yaw = yaw;
    this.lock = this.invuln = this.faceT = 0;
    if (this.oneShot) this.oneShot.action.stop();
    this.oneShot = null;
    this.root.position.copy(this.pos);
    this.root.rotation.y = yaw;
  }

  get busy() {
    return this.lock > 0;
  }

  playOneShot(name, { lock = 0, masked = false, fadeIn = 0.1, fadeOut = 0.2 } = {}) {
    if (this.oneShot) this.oneShot.action.stop();
    const a = this.actions[name];
    a.reset();
    a.setEffectiveWeight(0);
    a.play();
    this.oneShot = { action: a, t: 0, dur: a.getClip().duration, masked, fadeIn, fadeOut };
    this.lock = Math.max(this.lock, lock);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'sad') {
      this.actions.Sad.reset();
      this.actions.Sad.play();
    } else {
      this.actions.Sad.stop();
    }
    if (mode === 'play') this.modeW = 0;
  }

  faceToward(dx, dz, t) {
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) return;
    this.faceDir = { x: dx / l, z: dz / l };
    this.faceT = t;
  }

  hit(fromX, fromZ) {
    this.playOneShot('Hit', { lock: 0.35, fadeIn: 0.05 });
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ, d = Math.hypot(dx, dz) || 1;
    this.knock.set((dx / d) * 3.5 * this.s, (dz / d) * 3.5 * this.s);
    this.invuln = 1.6;
  }

  bucketWorld(out) {
    return this.bucket.getWorldPosition(out).add({ x: 0, y: 0.06 * this.s, z: 0 });
  }

  handWorld(out) {
    return this.hand.getWorldPosition(out);
  }

  update(dt, move, wantRun, world) {
    const T = this.tuning;
    if (this.lock > 0) this.lock -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    let mx = move.x, mz = move.z;
    if (this.lock > 0 || this.mode !== 'play') mx = mz = 0;
    const moving = mx !== 0 || mz !== 0;

    // corre enquanto o Shift estiver apertado, sem cansar
    const max = wantRun && moving ? this.runSpeed : this.walkSpeed;
    const k = 1 - Math.exp(-T.accel * dt);
    this.vel.x += (mx * max - this.vel.x) * k;
    this.vel.y += (mz * max - this.vel.y) * k;
    this.knock.multiplyScalar(Math.exp(-6 * dt));
    this.pos.x += (this.vel.x + this.knock.x) * dt;
    this.pos.z += (this.vel.y + this.knock.y) * dt;
    world.collide(this.pos, this.radius);
    this.pos.y += (world.heightAt(this.pos.x, this.pos.z) - this.pos.y) * Math.min(1, dt * 14);
    this.speed = this.vel.length();

    let target = null;
    if (this.faceT > 0) {
      this.faceT -= dt;
      target = Math.atan2(this.faceDir.x, this.faceDir.z);
    } else if (this.speed > 0.15 * this.s) {
      target = Math.atan2(this.vel.x, this.vel.y);
    }
    if (target !== null) this.yaw = dampAngle(this.yaw, target, T.turn * dt);

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this._updateAnim(dt);
    this.root.updateMatrixWorld(true);

    this.model.visible = this.invuln > 0 ? Math.floor(this.invuln * 12) % 2 === 0 : true;
    this.blob.position.set(this.pos.x, this.pos.y + 0.012 * this.s, this.pos.z);
  }

  _updateAnim(dt) {
    const A = this.actions;
    const s = this.speed / this.s; // na escala do modelo
    const ws = this.tuning.walk, rs = this.tuning.run;
    let wI, wW, wR;
    if (s < ws) {
      const k = smooth(s / ws);
      wI = 1 - k; wW = k; wR = 0;
    } else {
      const k = clamp((s - ws) / (rs - ws), 0, 1);
      wI = 0; wW = 1 - k; wR = k;
    }
    A.Walk.timeScale = clamp(s / WALK_NATURAL, 0.7, 2.2);
    A.Run.timeScale = clamp(s / RUN_NATURAL, 0.8, 2.0);
    const wd = A.Walk.getClip().duration, rd = A.Run.getClip().duration;
    if (wR > wW) A.Walk.time = (A.Run.time / rd) * wd;
    else A.Run.time = (A.Walk.time / wd) * rd;

    let os = 0;
    const o = this.oneShot;
    if (o) {
      o.t += dt;
      os = Math.min(1, o.t / o.fadeIn) * clamp((o.dur - o.t) / o.fadeOut, 0, 1);
      if (o.t >= o.dur) {
        o.action.stop();
        this.oneShot = null;
        os = 0;
      }
    }
    this.modeW = Math.min(1, this.mode === 'play' ? 0 : this.modeW + dt * 2.5);
    const mw = this.modeW;
    const loco = (o && !o.masked ? 1 - os : 1) * (1 - mw);
    A.Idle.setEffectiveWeight(wI * loco);
    A.Walk.setEffectiveWeight(wW * loco);
    A.Run.setEffectiveWeight(wR * loco);
    if (this.oneShot) this.oneShot.action.setEffectiveWeight(o.masked ? os * 6 : os * (1 - mw));
    A.Celebrate.setEffectiveWeight(this.mode === 'celebrate' ? mw : 0);
    A.Sad.setEffectiveWeight(this.mode === 'sad' ? mw : 0);
    this.mixer.update(dt);
  }

  // coisas brilhando no balde (vagalumes na fase 1, cogumelos na fase 3)
  updateBucket(time, carried, apples) {
    const p = this.bucket.getWorldPosition(this._v);
    const s = this.s;
    const [r, g, b] = this.orbColor;
    this.bucketLight.position.set(p.x, p.y + 0.45 * s, p.z);
    this.bucketLight.intensity = carried > 0 ? (0.25 + Math.min(carried, 10) * 0.07) * s * s : 0;
    this.orbs.begin();
    for (let i = 0; i < Math.min(carried, 16); i++) {
      const a = time * (1.2 + (i % 3) * 0.4) + i * 2.4;
      const rr = (0.035 + (i % 4) * 0.012) * s;
      const y = p.y + (0.1 + 0.03 * Math.sin(time * 2.6 + i * 1.7)) * s;
      this.orbs.push(p.x + Math.cos(a) * rr, y, p.z + Math.sin(a) * rr, r, g, b, (s > 1 ? 0.03 : 0.05) * s, 0.9);
    }
    this.orbs.end();
    this.applePile.visible = apples > 0;
  }
}
