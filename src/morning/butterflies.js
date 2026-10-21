import * as THREE from 'three';

const COLORS = [0xffa6d9, 0xffd45a, 0x8fd8ff, 0xb9a6ff, 0xff9a6b, 0x9dffb0, 0xff7ab6, 0xfff1a6, 0x7ad7ff, 0xffb37a];

// asa desenhada num canvas (branca com detalhes escuros); a cor vem do material
function wingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const lobe = (x, y, rx, ry, rot) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    g.fill();
  };
  g.fillStyle = '#3a2440';
  lobe(62, 44, 58, 40, -0.35);
  lobe(48, 96, 40, 28, 0.45);
  g.fillStyle = '#ffffff';
  lobe(62, 44, 52, 34, -0.35);
  lobe(48, 96, 34, 22, 0.45);
  g.fillStyle = '#3a2440';
  for (const [x, y, r] of [[88, 30, 7], [70, 52, 5], [52, 100, 6]]) lobe(x, y, r, r, 0);
  g.fillStyle = '#fff8d0';
  for (const [x, y, r] of [[88, 30, 3.5], [52, 100, 3]]) lobe(x, y, r, r, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Borboletas que nascem das sombras transformadas e ficam passeando pela clareira.
export class Butterflies {
  constructor(parent, world, size = 0.85) {
    this.parent = parent;
    this.world = world;
    this.list = [];
    // asa deitada, com a "dobradica" no corpo (x = 0) e a parte maior para a frente (+z)
    this.wingGeo = new THREE.PlaneGeometry(size * 0.5, size * 0.5).translate(size * 0.25, 0, 0).rotateX(Math.PI / 2);
    this.bodyGeo = new THREE.CapsuleGeometry(size * 0.035, size * 0.3, 3, 6).rotateX(Math.PI / 2);
    this.bodyMat = new THREE.MeshBasicMaterial({ color: 0x2a1c30 });
    this.tex = wingTexture();
  }

  reset() {
    for (const b of this.list) this.parent.remove(b.root);
    this.list.length = 0;
  }

  spawn(x, y, z) {
    const color = COLORS[this.list.length % COLORS.length];
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex, color, alphaTest: 0.5, side: THREE.DoubleSide,
    });
    const root = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    const right = new THREE.Mesh(this.wingGeo, mat);
    const left = new THREE.Mesh(this.wingGeo, mat);
    left.scale.x = -1;
    root.add(body, right, left);
    root.position.set(x, y, z);
    this.parent.add(root);
    const a = Math.random() * Math.PI * 2;
    this.list.push({
      root, left, right, vel: new THREE.Vector3(Math.cos(a) * 2, 3, Math.sin(a) * 2),
      phase: Math.random() * 10, seed: Math.random() * 100, target: new THREE.Vector3(x, y + 3, z), retarget: 0,
    });
  }

  // home: centro e raio do passeio; swirl: rodopiar em volta do ogro (comemoracao)
  update(dt, time, { home, ogre, swirl }) {
    for (const b of this.list) {
      const p = b.root.position;
      b.retarget -= dt;
      if (swirl) {
        const a = time * 1.6 + b.seed;
        const r = 3 + (b.seed % 1) * 2.5;
        b.target.set(ogre.x + Math.cos(a) * r, ogre.y + 2.5 + Math.sin(time * 2 + b.seed) * 1.2, ogre.z + Math.sin(a) * r);
      } else if (b.retarget <= 0) {
        b.retarget = 1.5 + Math.random() * 2.5;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * home.r;
        const x = home.x + Math.cos(a) * r, z = home.z + Math.sin(a) * r;
        b.target.set(x, this.world.heightAt(x, z) + 1.2 + Math.random() * 2.8, z);
      }
      // voo meio desajeitado: segue o alvo com tremidas
      const k = swirl ? 3.5 : 1.4;
      b.vel.x += ((b.target.x - p.x) * 0.6 - b.vel.x) * k * dt + Math.sin(time * 5.1 + b.seed) * 3 * dt;
      b.vel.z += ((b.target.z - p.z) * 0.6 - b.vel.z) * k * dt + Math.cos(time * 4.3 + b.seed) * 3 * dt;
      b.vel.y += ((b.target.y - p.y) * 0.8 - b.vel.y) * k * dt + Math.sin(time * 7.7 + b.seed) * 5 * dt;
      const sp = Math.hypot(b.vel.x, b.vel.z);
      const max = swirl ? 7 : 3.2;
      if (sp > max) {
        b.vel.x *= max / sp;
        b.vel.z *= max / sp;
      }
      p.addScaledVector(b.vel, dt);
      p.y = Math.max(p.y, this.world.heightAt(p.x, p.z) + 0.4);

      if (sp > 0.05) b.root.rotation.y = Math.atan2(b.vel.x, b.vel.z);
      b.root.rotation.x = THREE.MathUtils.clamp(-b.vel.y * 0.08, -0.5, 0.5);
      const flap = Math.sin(time * 16 + b.phase) * 0.85 + 0.25;
      b.right.rotation.z = flap;
      b.left.rotation.z = -flap;
    }
  }
}
