// Sky dome: the painted sky from House.blend by day, warm at sunset, stars and moon by night.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    gl_Position = p.xyww; // always on the far plane
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D skyMap;
  uniform float uNight;
  uniform float uDusk;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform vec3 uMoonDir;
  varying vec3 vDir;

  float hash13( vec3 p ) {
    p = fract( p * 0.1031 );
    p += dot( p, p.zyx + 31.32 );
    return fract( ( p.x + p.y ) * p.z );
  }

  void main() {
    vec3 dir = normalize( vDir );
    float el = asin( clamp( dir.y, -1.0, 1.0 ) );

    // The painting covers half the horizon; mirroring it makes the full circle seamless.
    // Its bottom half is painted treetops: keep only their tips at the horizon.
    float u = abs( atan( dir.z, dir.x ) ) / 3.14159265;
    float v = clamp( 0.4 + el / 1.6, 0.002, 0.998 );
    vec3 day = texture2D( skyMap, vec2( u, v ) ).rgb;

    // Sunset: tint the painting warm near the horizon and violet overhead, with a glow around the sun.
    float sd = max( dot( dir, uSunDir ), 0.0 );
    vec3 dusk = mix( vec3( 1.25, 0.62, 0.38 ), vec3( 0.42, 0.34, 0.62 ), smoothstep( 0.0, 0.75, el ) );
    vec3 sunset = day * dusk * 1.15 + vec3( 1.0, 0.55, 0.25 ) * ( pow( sd, 6.0 ) * 0.55 + pow( sd, 60.0 ) * 0.8 );
    sunset += vec3( 1.0, 0.85, 0.6 ) * smoothstep( 0.9992, 0.9996, sd ) * 2.5;
    day = mix( day, sunset, uDusk );

    vec3 night = mix( vec3( 0.02, 0.035, 0.08 ), vec3( 0.003, 0.006, 0.018 ), smoothstep( -0.05, 0.9, el ) );
    vec3 q = dir * 120.0;
    vec3 id = floor( q );
    float h = hash13( id );
    vec3 offset = vec3( hash13( id + 7.1 ), hash13( id + 3.3 ), hash13( id + 1.7 ) ) - 0.5;
    float star = step( 0.992, h ) * smoothstep( 0.18, 0.0, length( fract( q ) - 0.5 - offset * 0.6 ) );
    star *= ( 0.6 + 0.4 * sin( uTime * ( 1.5 + h * 3.0 ) + h * 80.0 ) ) * smoothstep( 0.02, 0.25, el );
    night += vec3( 0.9, 0.95, 1.0 ) * star * 1.6;

    float m = dot( dir, uMoonDir );
    night += vec3( 0.95, 0.97, 1.0 ) * smoothstep( 0.99965, 0.9998, m ) * 3.0;
    night += vec3( 0.25, 0.35, 0.6 ) * pow( max( m, 0.0 ), 60.0 ) * 0.4;

    gl_FragColor = vec4( mix( day, night, uNight ), 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSky(skyMap) {
  skyMap.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      skyMap: { value: skyMap },
      uNight: { value: 0 },
      uDusk: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uTime: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
