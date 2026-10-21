// Glowing fireflies (the green "stars" of the ogre scene), drifting near the ground.
import * as THREE from 'three';
import { CLEARINGS, PATHS, PLAY_RADIUS } from './layout.js';
import { heightAt } from './terrain.js';

const vertexShader = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uSize;
  varying float vBlink;
  void main() {
    float t = uTime * 0.5 + aPhase * 40.0;
    vec3 p = position + vec3( sin( t * 1.3 ) * 1.4, sin( t * 2.1 ) * 0.5, cos( t * 0.9 ) * 1.4 );
    vec4 mv = modelViewMatrix * vec4( p, 1.0 );
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize / -mv.z;
    vBlink = pow( 0.5 + 0.5 * sin( uTime * ( 1.2 + fract( aPhase * 7.0 ) * 1.5 ) + aPhase * 60.0 ), 3.0 );
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uIntensity;
  varying float vBlink;
  void main() {
    float a = smoothstep( 0.5, 0.0, length( gl_PointCoord - 0.5 ) );
    gl_FragColor = vec4( vec3( 0.35, 1.0, 0.55 ) * 4.0 * a * a * ( 0.15 + vBlink ) * uIntensity, 1.0 );
  }
`;

export function createFireflies(rand, count = 900) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const cottage = CLEARINGS.cottage;
  const pathPoints = Object.values(PATHS).flat();
  for (let i = 0; i < count; i++) {
    let x;
    let z;
    const pick = rand();
    if (pick < 0.55) {
      // Swarm in the twisted grove around the cottage.
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 42;
      x = cottage.x + Math.cos(a) * r;
      z = cottage.z + Math.sin(a) * r;
    } else if (pick < 0.8) {
      const [px, pz] = pathPoints[Math.floor(rand() * pathPoints.length)];
      x = px + (rand() - 0.5) * 14;
      z = pz + (rand() - 0.5) * 14;
    } else {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * PLAY_RADIUS;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    positions.set([x, heightAt(x, z) + 0.6 + rand() * 3, z], i * 3);
    phases[i] = rand();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: 60 }, uIntensity: { value: 0 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}
