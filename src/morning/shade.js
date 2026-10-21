import * as THREE from 'three';

const smoothstep = THREE.MathUtils.smoothstep;

// Onde faz sombra no chao: a copa de cada arvore projetada pelo sol (0 = sol, 1 = sombra).
// Bate com as sombras que aparecem na tela porque usa a mesma direcao do sol e o tamanho real das copas.
export class ShadeMap {
  constructor(world, center, radius, sunDir, cell = 0.75) {
    this.cell = cell;
    this.n = Math.ceil((radius * 2) / cell);
    this.x0 = center.x - radius;
    this.z0 = center.z - radius;
    this.size = this.n * cell;
    const n = this.n;
    const data = (this.data = new Float32Array(n * n));

    // deslocamento da sombra por metro de altura
    const kx = -sunDir.x / sunDir.y, kz = -sunDir.z / sunDir.y;
    const discs = [];
    this.patches = []; // centro da sombra de cada arvore: esconderijos para onde as sombras pulam
    for (const t of world.trees) {
      if (Math.hypot(t.x - center.x, t.z - center.z) > radius + 20) continue;
      // a copa tem altura: a sombra dela e um borrao alongado na direcao do sol
      const h = t.canopyY - t.y;
      this.patches.push({ x: t.x + kx * h, z: t.z + kz * h, r: t.canopyR * 0.8 });
      for (const k of [-0.6, 0, 0.6]) {
        const hh = h + k * t.canopyH;
        discs.push({ x: t.x + kx * hh, z: t.z + kz * hh, r: t.canopyR * (k > 0 ? 0.65 : 0.8) });
      }
    }
    for (const h of world.houses ?? []) discs.push({ x: h.x + kx * h.h * 0.5, z: h.z + kz * h.h * 0.5, r: h.r });

    for (const d of discs) {
      const i0 = Math.max(0, Math.floor((d.x - d.r - this.x0) / cell));
      const i1 = Math.min(n - 1, Math.ceil((d.x + d.r - this.x0) / cell));
      const j0 = Math.max(0, Math.floor((d.z - d.r - this.z0) / cell));
      const j1 = Math.min(n - 1, Math.ceil((d.z + d.r - this.z0) / cell));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = this.x0 + (i + 0.5) * cell, z = this.z0 + (j + 0.5) * cell;
          const v = smoothstep(d.r - Math.hypot(x - d.x, z - d.z), 0, d.r * 0.3);
          const k = j * n + i;
          if (v > data[k]) data[k] = v;
        }
      }
    }
    this.canvas = this._paint();
  }

  at(x, z) {
    const fx = (x - this.x0) / this.cell - 0.5, fz = (z - this.z0) / this.cell - 0.5;
    const n = this.n;
    if (fx < 0 || fz < 0 || fx >= n - 1 || fz >= n - 1) return 1; // fora do mapa: mata fechada
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const d = this.data, k = j * n + i;
    const a = d[k] + (d[k + 1] - d[k]) * tx;
    const b = d[k + n] + (d[k + n + 1] - d[k + n]) * tx;
    return a + (b - a) * tz;
  }

  // metros de sol no caminho em linha reta de a ate b
  sunAlong(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len));
    let sun = 0;
    for (let i = 1; i <= n; i++) sun += 1 - this.at(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n);
    return (sun * len) / n;
  }

  // imagem para o minimapa: verde-claro onde bate sol, escuro na sombra
  _paint() {
    const n = this.n;
    const cv = document.createElement('canvas');
    cv.width = cv.height = n;
    const cx = cv.getContext('2d');
    const img = cx.createImageData(n, n);
    for (let k = 0; k < n * n; k++) {
      const s = this.data[k];
      img.data[k * 4] = 150 - s * 115;
      img.data[k * 4 + 1] = 205 - s * 125;
      img.data[k * 4 + 2] = 95 - s * 45;
      img.data[k * 4 + 3] = 235;
    }
    cx.putImageData(img, 0, 0);
    return cv;
  }
}
