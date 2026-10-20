import * as THREE from 'three';
import { nodeName } from './assets.js';
import { CONFIG, HOUSE } from './config.js';
import { makeGlowSprite } from './fx.js';

// vento nas folhas: deslocamento depois da matriz da instancia (espaco da arvore)
const LEAF_WIND = /* glsl */ `
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
    float lw = sin( uTime * 1.7 + mvPosition.x * 1.3 + mvPosition.z * 0.9 ) + 0.5 * sin( uTime * 2.9 + mvPosition.y * 2.0 );
    mvPosition.xyz += vec3( 0.018, 0.008, 0.014 ) * lw * clamp( mvPosition.y * 0.4, 0.0, 1.5 );
  #endif
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
`;

// grama: balanca com o vento e se abre quando o ogro passa
const GRASS_WIND = /* glsl */ `
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    vec3 gBase = instanceMatrix[3].xyz;
    mvPosition = instanceMatrix * mvPosition;
    float gh = max( 0.0, mvPosition.y - gBase.y );
    float gw = sin( uTime * 2.2 + gBase.x * 1.3 + gBase.z * 1.1 ) + 0.6 * sin( uTime * 3.7 + gBase.x * 2.3 - gBase.z );
    mvPosition.xz += vec2( 0.55, 0.35 ) * gw * gh * 0.22;
    vec2 gd = gBase.xz - uOgre.xz;
    float gLen = length( gd );
    if ( gLen < 0.45 && gLen > 0.0001 ) {
      mvPosition.xz += normalize( gd ) * ( 0.45 - gLen ) * gh * 2.2;
      mvPosition.y -= ( 0.45 - gLen ) * gh * 0.8;
    }
  #endif
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
`;

const NIGHT_TOP = new THREE.Color(0.003, 0.005, 0.016);
const NIGHT_HOR = new THREE.Color(0.02, 0.03, 0.07);
const DAWN_TOP = new THREE.Color(0.12, 0.2, 0.45);
const DAWN_HOR = new THREE.Color(1.0, 0.55, 0.3);
const MOON_DIR = new THREE.Vector3(-0.45, 0.42, -0.79).normalize();
const SUN_DIR = new THREE.Vector3(0.9, 0.08, -0.42).normalize();

function firstMesh(o) {
  let m = null;
  o?.traverse((c) => { if (!m && c.isMesh) m = c; });
  return m;
}

export class World {
  constructor(scene, assets) {
    this.scene = scene;
    this.level = assets.level;
    this.root = assets.scene.scene;
    this.uniforms = { uTime: { value: 0 }, uOgre: { value: new THREE.Vector3(0, -10, 0) } };
    this.circles = [];
    scene.add(this.root);

    this._prepareMaterials();
    this._buildGround(assets.textures);
    this._buildLeaves(assets.instances);
    this._buildGrass(assets.instances, assets.textures.mask);
    this._buildSky();
    this._buildLights();
    for (const t of this.trees) this.circles.push({ x: t.x, z: t.z, r: t.col });
  }

  _prepareMaterials() {
    const houseLights = [];
    this.root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const m = o.material;
      if (m.name === 'metal' || m.name === 'luminary') {
        m.metalness = 0.3;
        m.roughness = 0.55;
      }
      if (m.name === 'stars') {
        // no .blend sao verde-agua; azulados para nao confundir com os vagalumes coletaveis
        m.emissive.setRGB(0.45, 0.75, 1.0);
        m.emissiveIntensity = 1.4;
        m.fog = false;
      }
      if (m.name === 'light') {
        let p = o.parent, inLamppost = false;
        while (p) { if (p.name === 'Lamppost') inLamppost = true; p = p.parent; }
        if (!inLamppost) houseLights.push(o);
      }
    });
    // lampadas da fachada: brilho acompanha a lareira
    this.houseGlowMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb060, emissiveIntensity: 3 });
    for (const o of houseLights) o.material = this.houseGlowMat;
  }

  _buildGround(tex) {
    const plane = this.root.getObjectByName('Plane');
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    mat.defines = { USE_UV: '' };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tGrass = { value: tex.grass };
      sh.uniforms.tGround = { value: tex.ground };
      sh.uniforms.tMask = { value: tex.mask };
      // mesma mistura do material "Grass" do Blender: grama x terra, guiada pela mascara do caminho
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform sampler2D tGrass;\nuniform sampler2D tGround;\nuniform sampler2D tMask;\nvoid main() {')
        .replace('#include <map_fragment>', /* glsl */ `
          vec3 gC = texture2D( tGrass, vUv * 3.0 ).rgb;
          vec3 dC = texture2D( tGround, vUv * 3.0 ).rgb;
          float mB = texture2D( tMask, vUv ).b;
          float mixV = 0.5 * gC.r + 0.5 * mB;
          float pathF = clamp( ( 0.505 - mixV ) / 0.355, 0.0, 1.0 );
          diffuseColor.rgb *= mix( gC, dC, pathF );
        `);
    };
    plane.material = mat;

    // chao alem do plano original, para nao ver a borda
    const skirtTex = tex.grass.clone();
    skirtTex.repeat.set(13, 13);
    skirtTex.needsUpdate = true;
    const skirt = new THREE.Mesh(
      new THREE.CircleGeometry(80, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: skirtTex, color: 0x8a948a, roughness: 1 }),
    );
    skirt.position.y = -0.03;
    this.scene.add(skirt);
  }

  _windify(mat, kind) {
    const u = this.uniforms;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = u.uTime;
      sh.uniforms.uOgre = u.uOgre;
      sh.vertexShader = 'uniform float uTime;\nuniform vec3 uOgre;\n' +
        sh.vertexShader.replace('#include <project_vertex>', kind === 'leaf' ? LEAF_WIND : GRASS_WIND);
    };
    mat.customProgramCacheKey = () => 'wind-' + kind;
  }

  _buildLeaves(inst) {
    const node = this.root.getObjectByName('Leaf');
    const src = firstMesh(node);
    const mat = src.material.clone();
    mat.alphaTest = 0.5;
    mat.transparent = false;
    mat.side = THREE.DoubleSide;
    this._windify(mat, 'leaf');
    node.removeFromParent();

    this.trees = [];
    const m4 = new THREE.Matrix4();
    for (const t of this.level.trees) {
      const L = this.level.leaves.find((l) => l.tree === t.name);
      let leaves = null;
      if (L && L.count) {
        leaves = new THREE.InstancedMesh(src.geometry, mat, L.count);
        for (let i = 0; i < L.count; i++) {
          m4.fromArray(inst, (L.offset + i) * 16);
          leaves.setMatrixAt(i, m4);
        }
        leaves.instanceMatrix.needsUpdate = true;
        leaves.position.fromArray(L.base);
        leaves.computeBoundingSphere();
        this.scene.add(leaves);
      }
      const trunk = this.root.getObjectByName(nodeName(t.name));
      this.trees.push({
        // col: raio de colisao entre o tronco e a ponta das raizes
        name: t.name, x: t.pos[0], z: t.pos[2], r: t.r, col: (t.r + (t.rc ?? t.r)) / 2, h: t.h,
        trunk, trunkQuat: trunk ? trunk.quaternion.clone() : null,
        leaves, shake: 0, cooldown: 0,
      });
    }
  }

  _buildGrass(inst, maskTex) {
    const node = this.root.getObjectByName('grass');
    const src = firstMesh(node);
    const mat = src.material.clone();
    mat.side = THREE.DoubleSide;
    mat.color.multiplyScalar(0.75);
    this._windify(mat, 'grass');
    node.removeFromParent();

    const G = this.level.grass;
    const EXTRA = 7000;
    const mesh = new THREE.InstancedMesh(src.geometry, mat, G.count + EXTRA);
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    let scaleSum = 0;
    for (let i = 0; i < G.count; i++) {
      m4.fromArray(inst, (G.offset + i) * 16);
      m4.decompose(p, q, s);
      scaleSum += s.y;
      mesh.setMatrixAt(n, m4);
      mesh.setColorAt(n++, col.setHSL(0.24 + Math.random() * 0.06, 0.8, 0.45 + Math.random() * 0.2));
    }
    const baseScale = G.count ? scaleSum / G.count : 0.04;

    // mascara do caminho: evita grama na terra batida
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(maskTex.image, 0, 0, 256, 256);
    const mask = cx.getImageData(0, 0, 256, 256).data;
    const [uc, vc] = this.level.ground.uv;
    const onPath = (x, z) => {
      const u = uc[0] * x + uc[1] * z + uc[2];
      const v = vc[0] * x + vc[1] * z + vc[2];
      if (u < 0 || u > 1 || v < 0 || v > 1) return false;
      const i = (Math.floor(v * 255) * 256 + Math.floor(u * 255)) * 4;
      return mask[i + 2] < 140;
    };
    const Y = new THREE.Vector3(0, 1, 0);
    for (let k = 0, tries = 0; k < EXTRA && tries < EXTRA * 4; tries++) {
      const r = 1.5 + Math.sqrt(Math.random()) * 16.5;
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < HOUSE.platformX + 0.1 && Math.abs(z) < HOUSE.platformZ + 0.1) continue;
      if (onPath(x, z)) continue;
      if (this.trees.some((t) => Math.hypot(x - t.x, z - t.z) < t.col * 0.8)) continue;
      q.setFromAxisAngle(Y, Math.random() * Math.PI * 2);
      s.setScalar(baseScale * (0.55 + Math.random() * 0.9));
      m4.compose(p.set(x, 0, z), q, s);
      mesh.setMatrixAt(n, m4);
      mesh.setColorAt(n++, col.setHSL(0.22 + Math.random() * 0.08, 0.75, 0.35 + Math.random() * 0.25));
      k++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.scene.add(mesh);
    this.onPath = onPath;
  }

  _buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: NIGHT_TOP.clone() },
        uHor: { value: NIGHT_HOR.clone() },
        uMoon: { value: MOON_DIR },
        uSun: { value: SUN_DIR },
        uDawn: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize( position );
          vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHor, uMoon, uSun;
        uniform float uDawn;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize( vDir );
          float h = smoothstep( -0.05, 0.55, d.y );
          vec3 col = mix( uHor, uTop, pow( h, 0.8 ) );
          col += vec3( 0.25, 0.3, 0.45 ) * pow( max( dot( d, uMoon ), 0.0 ), 24.0 ) * 0.25 * ( 1.0 - uDawn );
          col += vec3( 1.0, 0.55, 0.25 ) * pow( max( dot( d, uSun ), 0.0 ), 6.0 ) * uDawn * 0.8;
          gl_FragColor = vec4( col, 1.0 );
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.scene.add(sky);

    // estrelas do ceu
    const N = 1500;
    const pos = new Float32Array(N * 3), ph = new Float32Array(N), sz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.05;
      const rr = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * rr * 95, y * 95, Math.sin(a) * rr * 95], i * 3);
      ph[i] = Math.random() * 100;
      sz[i] = 0.18 + Math.pow(Math.random(), 4) * 0.5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime, uFade: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aPhase;
        attribute float aSize;
        varying float vA;
        void main() {
          vA = 0.55 + 0.45 * sin( uTime * ( 1.0 + fract( aPhase ) * 2.0 ) + aPhase );
          vec4 mv = modelViewMatrix * vec4( position, 1.0 );
          gl_PointSize = aSize * 900.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFade;
        varying float vA;
        void main() {
          float r = length( gl_PointCoord - 0.5 ) * 2.0;
          float a = smoothstep( 1.0, 0.0, r ) * vA * uFade;
          gl_FragColor = vec4( vec3( 0.85, 0.9, 1.0 ) * 1.4, a );
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(g, this.starMat);
    stars.frustumCulled = false;
    this.scene.add(stars);

    this.moonSprite = makeGlowSprite(0xdfe6ff, 9, 0.9);
    this.moonSprite.position.copy(MOON_DIR).multiplyScalar(90);
    this.scene.add(this.moonSprite);
    this.moonDisc = makeGlowSprite(0xffffff, 2.6, 1);
    this.moonDisc.material.color.setRGB(2.5, 2.6, 3);
    this.moonDisc.position.copy(MOON_DIR).multiplyScalar(89);
    this.scene.add(this.moonDisc);
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0x6070b0, 0x101a0c, 0.6);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xa8bcff, 0.55);
    this.moon.position.copy(MOON_DIR).multiplyScalar(30);
    this.scene.add(this.moon);

    const L = this.level.lights;
    this.interior = new THREE.PointLight(0xff6a2a, 2, 2.0, 2);
    this.interior.position.fromArray(L.interior);
    this.scene.add(this.interior);
    this.porch = new THREE.PointLight(0xffa050, 1, 4.5, 2);
    this.porch.position.set(0, 1.1, 2.3);
    this.scene.add(this.porch);

    // luz suave que acompanha o ogro, para ele nao sumir no escuro
    this.fill = new THREE.PointLight(0xc8d4ff, 0.7, 3.5, 2);
    this.scene.add(this.fill);

    this.houseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, 72).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.houseRing.position.y = 0.03;
    this.scene.add(this.houseRing);
  }

  addCircle(x, z, r) {
    this.circles.push({ x, z, r });
  }

  heightAt(x, z) {
    const dx = Math.max(0, Math.abs(x) - HOUSE.platformX);
    const dz = Math.max(0, Math.abs(z) - HOUSE.platformZ);
    const d = Math.hypot(dx, dz);
    return d > 0.08 ? 0 : HOUSE.platformH * (1 - d / 0.08);
  }

  collide(p, radius) {
    for (const c of this.circles) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    }
    const h = HOUSE.half + radius;
    if (Math.abs(p.x) < h && Math.abs(p.z) < h) {
      const px = h - Math.abs(p.x), pz = h - Math.abs(p.z);
      if (px < pz) p.x = Math.sign(p.x || 1) * h;
      else p.z = Math.sign(p.z || 1) * h;
    }
    const R = CONFIG.worldRadius;
    const d = Math.hypot(p.x, p.z);
    if (d > R) {
      p.x *= R / d;
      p.z *= R / d;
    }
  }

  insideHouse(x, z, pad = 0) {
    return Math.abs(x) < HOUSE.half + pad && Math.abs(z) < HOUSE.half + pad;
  }

  nearestTree(x, z, reach) {
    let best = null, bd = Infinity;
    for (const t of this.trees) {
      const d = Math.hypot(x - t.x, z - t.z) - t.col;
      if (d < reach && d < bd) { bd = d; best = t; }
    }
    return best;
  }

  shakeTree(t) {
    t.shake = 1;
    t.cooldown = CONFIG.tree.cooldown;
  }

  update(dt, time, dawn, hearth, ogrePos) {
    this.uniforms.uTime.value = time;
    this.uniforms.uOgre.value.copy(ogrePos);

    // ceu, neblina e luz ambiente acompanham o amanhecer
    const su = this.skyMat.uniforms;
    su.uTop.value.copy(NIGHT_TOP).lerp(DAWN_TOP, dawn);
    su.uHor.value.copy(NIGHT_HOR).lerp(DAWN_HOR, dawn);
    su.uDawn.value = dawn;
    this.starMat.uniforms.uFade.value = 1 - dawn;
    this.moonSprite.material.opacity = 0.9 * (1 - dawn);
    this.moonDisc.material.opacity = 1 - dawn;
    if (this.scene.fog) {
      this.scene.fog.color.copy(su.uHor.value).multiplyScalar(0.9);
      this.scene.fog.density = 0.05 - dawn * 0.025;
    }
    this.hemi.intensity = 0.6 + dawn * 1.1;
    this.hemi.color.setRGB(0.38 + dawn * 0.6, 0.44 + dawn * 0.35, 0.69 - dawn * 0.1);
    this.moon.intensity = 0.55 + dawn * 1.4;
    this.moon.color.setRGB(0.66 + dawn * 0.34, 0.74 + dawn * 0.0, 1.0 - dawn * 0.45);
    this.moon.position.copy(MOON_DIR).lerp(SUN_DIR, dawn).multiplyScalar(30);

    // casa: brilho proporcional a lareira, com tremulacao de fogo
    const fl = 1 + 0.08 * Math.sin(time * 11.3) + 0.05 * Math.sin(time * 23.7);
    const h = Math.max(0, hearth);
    this.houseGlowMat.emissiveIntensity = (0.15 + 3.5 * h) * fl;
    this.interior.intensity = (0.2 + 2.2 * h) * fl;
    this.porch.intensity = (0.1 + 0.9 * h) * fl;
    this.houseRing.scale.setScalar(this.houseLightRadius(h));
    this.houseRing.material.opacity = 0.03 + 0.06 * h;

    this.fill.position.set(ogrePos.x, ogrePos.y + 1.2, ogrePos.z + 0.3);

    for (const t of this.trees) {
      if (t.cooldown > 0) t.cooldown -= dt;
      if (t.shake > 0) {
        t.shake = Math.max(0, t.shake - dt * 1.4);
        const a = Math.sin(time * 30) * 0.03 * t.shake;
        if (t.leaves) t.leaves.rotation.set(a * 0.7, 0, a);
        if (t.trunk) t.trunk.quaternion.copy(t.trunkQuat).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(a * 0.4, 0, a * 0.4)));
      }
    }
  }

  houseLightRadius(h) {
    return h > 0.01 ? CONFIG.hearth.lightRadius * (0.55 + 0.45 * h) : 0.01;
  }
}
