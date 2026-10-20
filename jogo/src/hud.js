import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['loading', 'start', 'pause', 'end'];

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      hearthPanel: document.querySelector('.hearth'),
      hearthFill: $('hearth-fill'),
      hearthPct: $('hearth-pct'),
      clock: $('clock'),
      nightFill: $('night-fill'),
      apples: $('apples'),
      fireflies: $('fireflies'),
      slotApples: $('slot-apples'),
      slotFire: $('slot-fireflies'),
      stamina: $('stamina-fill'),
      staminaBox: document.querySelector('.stamina'),
      roar: $('roar'),
      roarRing: $('roar-ring'),
      hint: $('hint'),
      toasts: $('toasts'),
      vignette: $('vignette'),
      loadFill: $('load-fill'),
      minimap: $('minimap'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.lastHint = undefined;
    this.vig = 0;
    this.prev = {};
  }

  setLoading(p) {
    this.el.loadFill.style.width = `${Math.round(p * 100)}%`;
  }

  screen(name) {
    for (const s of SCREENS) $('screen-' + s).classList.toggle('hidden', s !== name);
  }

  showHud(v) {
    this.el.hud.classList.toggle('hidden', !v);
  }

  _set(key, el, value, slot) {
    if (this.prev[key] === value) return;
    if (slot && this.prev[key] !== undefined) {
      slot.classList.remove('bump');
      void slot.offsetWidth;
      slot.classList.add('bump');
    }
    this.prev[key] = value;
    el.textContent = value;
  }

  update(g, dt) {
    const e = this.el;
    const h = Math.max(0, g.hearth);
    e.hearthFill.style.width = `${h * 100}%`;
    e.hearthPct.textContent = `${Math.round(h * 100)}%`;
    e.hearthPanel.classList.toggle('danger', h < 0.25);

    const mins = 20 * 60 + Math.floor(g.progress * 600);
    e.clock.textContent = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    e.nightFill.style.width = `${g.progress * 100}%`;

    this._set('apples', e.apples, g.appleCount, e.slotApples);
    this._set('fire', e.fireflies, g.carried, e.slotFire);
    e.slotApples.classList.toggle('empty', g.appleCount === 0);
    e.slotFire.classList.toggle('full', g.carried >= CONFIG.bucketCapacity);
    e.stamina.style.width = `${g.ogre.stamina * 100}%`;
    e.staminaBox.classList.toggle('tired', g.ogre.tired);

    const frac = 1 - g.roarCd / CONFIG.roar.cooldown;
    e.roarRing.style.strokeDashoffset = `${176 * (1 - Math.min(1, frac))}`;
    e.roar.classList.toggle('ready', g.roarCd <= 0);
    e.roar.classList.toggle('cooling', g.roarCd > 0);

    this.vig = Math.max(0, this.vig - dt * 1.5);
    e.vignette.style.opacity = this.vig.toFixed(3);
  }

  hint(html) {
    if (html === this.lastHint) return;
    this.lastHint = html;
    if (html) this.el.hint.innerHTML = html;
    this.el.hint.classList.toggle('show', !!html);
  }

  toast(html, kind = '', dur = 3) {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.innerHTML = html;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => {
      d.classList.add('out');
      setTimeout(() => d.remove(), 400);
    }, dur * 1000);
  }

  clearToasts() {
    this.el.toasts.innerHTML = '';
  }

  flash(amount = 0.8) {
    this.vig = Math.max(this.vig, amount);
  }

  minimap(g, time) {
    const c = this.mm;
    const W = this.el.minimap.width, R = W / 2;
    const S = (R - 8) / CONFIG.worldRadius;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath();
    c.arc(R, R, R - 1, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = 'rgba(8,10,22,0.85)';
    c.fillRect(0, 0, W, W);
    c.translate(R, R);
    c.rotate(g.rig.yaw);   // frente da camera aponta para cima

    for (const l of g.lanterns.list) {
      const r = g.lanterns.radius(l);
      if (r > 0) {
        const grd = c.createRadialGradient(l.x * S, l.z * S, 0, l.x * S, l.z * S, r * S);
        grd.addColorStop(0, 'rgba(255,190,90,0.35)');
        grd.addColorStop(1, 'rgba(255,190,90,0)');
        c.fillStyle = grd;
        c.beginPath();
        c.arc(l.x * S, l.z * S, r * S, 0, Math.PI * 2);
        c.fill();
      }
    }
    const hr = g.world.houseLightRadius(g.hearth) * S;
    const hg = c.createRadialGradient(0, 0, 0, 0, 0, hr);
    hg.addColorStop(0, `rgba(255,140,60,${0.2 + 0.3 * g.hearth})`);
    hg.addColorStop(1, 'rgba(255,140,60,0)');
    c.fillStyle = hg;
    c.beginPath();
    c.arc(0, 0, hr, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = 'rgba(40,70,40,0.9)';
    for (const t of g.world.trees) {
      c.beginPath();
      c.arc(t.x * S, t.z * S, Math.max(2, t.col * S), 0, Math.PI * 2);
      c.fill();
    }
    const attacked = g.houseAttacked > 0 && Math.floor(time * 6) % 2 === 0;
    c.fillStyle = attacked ? '#ff4a6a' : `rgb(${120 + 135 * g.hearth},${70 + 80 * g.hearth},40)`;
    const hs = 0.97 * S;
    c.fillRect(-hs, -hs, hs * 2, hs * 2);

    for (const l of g.lanterns.list) {
      c.fillStyle = l.fuel > 0.01 ? '#ffd27a' : '#555a70';
      c.beginPath();
      c.arc(l.x * S, l.z * S, 3, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#7dffa8';
    for (const f of g.fireflies.list) c.fillRect(f.x * S - 1, f.z * S - 1, 2, 2);
    c.fillStyle = '#ff5a4a';
    for (const a of g.apples.ground) c.fillRect(a.m.position.x * S - 1.5, a.m.position.z * S - 1.5, 3, 3);
    for (const s of g.shadows.list) {
      if (s.state === 'dying') continue;
      c.fillStyle = s.attacking && Math.floor(time * 8) % 2 ? '#ff4a6a' : '#b77dff';
      c.beginPath();
      c.arc(s.x * S, s.z * S, s.big ? 4.5 : 3, 0, Math.PI * 2);
      c.fill();
    }
    const o = g.ogre;
    c.save();
    c.translate(o.pos.x * S, o.pos.z * S);
    c.rotate(-o.yaw);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, 6);
    c.lineTo(4, -4);
    c.lineTo(-4, -4);
    c.closePath();
    c.fill();
    c.restore();
    c.restore();
  }

  showEnd(win, stats, moons) {
    $('end-title').textContent = win ? 'O sol nasceu!' : 'A lareira se apagou…';
    $('end-sub').textContent = win
      ? 'O ogro manteve a casinha acesa a noite inteira.'
      : 'As sombras ficaram com a floresta desta vez.';
    $('end-moons').innerHTML = win
      ? [0, 1, 2].map((i) => `<span class="${i < moons ? '' : 'off'}">★</span>`).join('')
      : '';
    const rows = [
      ['Lareira ao amanhecer', `${Math.round(Math.max(0, stats.hearth) * 100)}%`],
      ['Vagalumes entregues', stats.delivered],
      ['Lanternas acesas', stats.lit],
      ['Sombras espantadas', stats.banished],
      ['Maçãs arremessadas', stats.thrown],
      ['Rugidos', stats.roars],
    ];
    if (!win) rows[0][0] = 'Sobreviveu até';
    if (!win) rows[0][1] = stats.clock;
    $('end-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    this.screen('end');
  }
}
