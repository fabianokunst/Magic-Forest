// Lights, fog, bloom and day/night: everything blends between the DAY and NIGHT presets.
import * as THREE from 'three';

const DAY = {
  sun: 0xfff0d6, sunIntensity: 2.6,
  hemiSky: 0xcdeeff, hemiGround: 0x5a6b3a, hemiIntensity: 1.3,
  fog: 0x86bdb8, fogDensity: 0.0065,
  exposure: 1.0, glow: 0.6, lamp: 0, fireflies: 0, bloom: 0.12, bloomThreshold: 1.4,
};
const NIGHT = {
  sun: 0x8fa8ff, sunIntensity: 0.6,
  hemiSky: 0x3a5088, hemiGround: 0x0e1424, hemiIntensity: 0.65,
  fog: 0x0b1326, fogDensity: 0.011,
  exposure: 1.15, glow: 8, lamp: 10, fireflies: 1, bloom: 0.85, bloomThreshold: 0.6,
};
const SUN_DIR = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
export const MOON_DIR = new THREE.Vector3(-0.4, 0.7, -0.55).normalize();

const SHADOW_EXTENT = 55;
const SHADOW_MAP = 2048;
const LIGHT_POOL = 6; // the nearest lamps get real point lights; the count never changes (no shader recompiles)
const _night = new THREE.Color();

export class Atmosphere {
  constructor({ scene, renderer, sky, fireflies, glowMaterials, lamps, bloom, night = false }) {
    Object.assign(this, { scene, renderer, sky, fireflies, glowMaterials, bloom });
    this.night = this.target = night ? 1 : 0;

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
    this.apply();
  }

  toggle() {
    this.target = this.target > 0.5 ? 0 : 1;
  }

  apply() {
    const t = this.night;
    const mix = (key) => THREE.MathUtils.lerp(DAY[key], NIGHT[key], t);
    const mixColor = (color, key) => color.setHex(DAY[key]).lerp(_night.setHex(NIGHT[key]), t);

    mixColor(this.sun.color, 'sun');
    this.sun.intensity = mix('sunIntensity');
    mixColor(this.hemi.color, 'hemiSky');
    mixColor(this.hemi.groundColor, 'hemiGround');
    this.hemi.intensity = mix('hemiIntensity');
    mixColor(this.scene.fog.color, 'fog');
    this.scene.fog.density = mix('fogDensity');
    this.renderer.toneMappingExposure = mix('exposure');
    for (const m of this.glowMaterials) m.emissiveIntensity = mix('glow');
    this.fireflies.material.uniforms.uIntensity.value = mix('fireflies');
    this.sky.material.uniforms.uNight.value = t;
    this.bloom.strength = mix('bloom');
    this.bloom.threshold = mix('bloomThreshold');
    this.lampIntensity = mix('lamp');
    this.dir.lerpVectors(SUN_DIR, MOON_DIR, t).normalize();
  }

  update(dt, focus) {
    if (Math.abs(this.target - this.night) > 1e-3) {
      this.night += (this.target - this.night) * (1 - Math.exp(-dt * 1.5));
      this.apply();
    }

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
