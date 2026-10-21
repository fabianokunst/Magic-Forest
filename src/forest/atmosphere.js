// Lights, fog, bloom and time of day: everything blends DAY -> DUSK -> NIGHT with one number (0..1).
import * as THREE from 'three';

const DAY = {
  sun: 0xfff0d6, sunIntensity: 2.6,
  hemiSky: 0xcdeeff, hemiGround: 0x5a6b3a, hemiIntensity: 1.3,
  fog: 0x86bdb8, fogDensity: 0.0065,
  exposure: 1.0, glow: 0.6, lamp: 0, fireflies: 0, bloom: 0.12, bloomThreshold: 1.4,
};
const DUSK = {
  sun: 0xffa25a, sunIntensity: 2.3,
  hemiSky: 0xf0b49a, hemiGround: 0x4a3530, hemiIntensity: 0.95,
  fog: 0xc98f78, fogDensity: 0.0085,
  exposure: 1.05, glow: 3.5, lamp: 3, fireflies: 0.15, bloom: 0.35, bloomThreshold: 1.0,
};
const NIGHT = {
  sun: 0x8fa8ff, sunIntensity: 0.6,
  hemiSky: 0x3a5088, hemiGround: 0x0e1424, hemiIntensity: 0.65,
  fog: 0x0b1326, fogDensity: 0.011,
  exposure: 1.15, glow: 8, lamp: 10, fireflies: 1, bloom: 0.85, bloomThreshold: 0.6,
};
export const SUN_DIR = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
export const DUSK_DIR = new THREE.Vector3(-0.62, 0.2, 0.76).normalize();
export const MOON_DIR = new THREE.Vector3(-0.4, 0.7, -0.55).normalize();

const SHADOW_EXTENT = 55;
const SHADOW_MAP = 2048;
const LIGHT_POOL = 6; // the nearest lamps get real point lights; the count never changes (no shader recompiles)
const _a = new THREE.Color();
const _b = new THREE.Color();

export class Atmosphere {
  constructor({ scene, renderer, sky, fireflies, glowMaterials, lamps }) {
    Object.assign(this, { scene, renderer, sky, fireflies, glowMaterials });
    this.bloom = null; // the app's bloom pass, set while this world is on screen
    this.time = 0;

    // Lanterns closer than 4 m share one point light, so a house with several lanterns
    // side by side doesn't stack lights on its wall.
    this.lamps = [];
    for (const p of lamps) {
      const spot = this.lamps.find((s) => s.distanceTo(p) < 4);
      if (spot) spot.lerp(p, 0.5);
      else this.lamps.push(p.clone());
    }

    this.hemi = new THREE.HemisphereLight();
    this.sun = new THREE.DirectionalLight();
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -SHADOW_EXTENT;
    cam.right = cam.top = SHADOW_EXTENT;
    cam.near = 1;
    cam.far = 300;
    this.sun.shadow.mapSize.setScalar(SHADOW_MAP);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.pool = Array.from({ length: LIGHT_POOL }, () => new THREE.PointLight(0xffb15e, 0, 22, 1.6));
    scene.add(this.hemi, this.sun, this.sun.target, ...this.pool);
    scene.fog = new THREE.FogExp2(0x000000, 0.01);

    sky.material.uniforms.uMoonDir.value.copy(MOON_DIR);
    this.dir = new THREE.Vector3();
    this.setTime(0);
  }

  // 0 = day, 0.5 = sunset, 1 = night
  setTime(t) {
    this.time = THREE.MathUtils.clamp(t, 0, 1);
    this.apply();
  }

  apply() {
    const t = this.time;
    const [A, B, k, dA, dB] = t < 0.5 ? [DAY, DUSK, t * 2, SUN_DIR, DUSK_DIR] : [DUSK, NIGHT, t * 2 - 1, DUSK_DIR, MOON_DIR];
    const mix = (key) => THREE.MathUtils.lerp(A[key], B[key], k);
    const mixColor = (color, key) => color.copy(_a.setHex(A[key])).lerp(_b.setHex(B[key]), k);

    mixColor(this.sun.color, 'sun');
    this.sun.intensity = mix('sunIntensity');
    mixColor(this.hemi.color, 'hemiSky');
    mixColor(this.hemi.groundColor, 'hemiGround');
    this.hemi.intensity = mix('hemiIntensity');
    mixColor(this.scene.fog.color, 'fog');
    this.scene.fog.density = mix('fogDensity');
    this.exposure = mix('exposure');
    for (const m of this.glowMaterials) m.emissiveIntensity = mix('glow');
    this.fireflies.material.uniforms.uIntensity.value = mix('fireflies');
    const su = this.sky.material.uniforms;
    su.uNight.value = Math.max(0, t * 2 - 1);
    su.uDusk.value = 1 - Math.min(1, Math.abs(t - 0.5) * 2);
    this.lampIntensity = mix('lamp');
    this.dir.lerpVectors(dA, dB, k).normalize();
    su.uSunDir.value.copy(this.dir);
    this.renderer.toneMappingExposure = this.exposure;
    if (this.bloom) {
      this.bloom.strength = mix('bloom');
      this.bloom.threshold = mix('bloomThreshold');
      this.bloom.radius = 0.6;
    }
  }

  update(dt, focus) {
    // The shadow box follows the player, snapped to whole texels to avoid shimmering.
    const texel = (2 * SHADOW_EXTENT) / SHADOW_MAP;
    this.sun.target.position.set(Math.round(focus.x / texel) * texel, focus.y, Math.round(focus.z / texel) * texel);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.dir, 120);

    // Hand the point lights to the nearest lamps, fading them out with distance.
    const nearest = this.lamps
      .map((p) => ({ p, d: p.distanceTo(focus) }))
      .sort((a, b) => a.d - b.d);
    this.pool.forEach((light, i) => {
      const lamp = nearest[i];
      if (!lamp) {
        light.intensity = 0;
        return;
      }
      light.position.copy(lamp.p);
      light.intensity = this.lampIntensity * (1 - THREE.MathUtils.smoothstep(lamp.d, 35, 55));
    });
  }
}
