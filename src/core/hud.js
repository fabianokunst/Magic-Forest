// HUD comum as fases: objetivo (canto superior esquerdo), relogio, minimapa, inventario, rugido, avisos.
const $ = (id) => document.getElementById(id);
const SCREENS = ['loading', 'menu', 'intro', 'pause', 'end'];

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      goal: $('goal'),
      goalIcon: $('goal-icon'),
      goalLabel: $('goal-label'),
      goalValue: $('goal-value'),
      goalFill: $('goal-fill'),
      clockPanel: $('clock-panel'),
      clockFrom: $('clock-from'),
      clockTo: $('clock-to'),
      clock: $('clock'),
      clockFill: $('clock-fill'),
      apples: $('apples'),
      fireflies: $('fireflies'),
      slotApples: $('slot-apples'),
      slotFire: $('slot-fireflies'),
      slotCarry: $('slot-carry'),
      carry: $('carry'),
      carryIcon: $('carry-icon'),
      carryMax: $('carry-max'),
      inventory: document.querySelector('.inventory'),
      roar: $('roar'),
      roarRing: $('roar-ring'),
      roarText: $('roar-text'),
      banner: $('banner'),
      hint: $('hint'),
      toasts: $('toasts'),
      crosshair: $('crosshair'),
      vignette: $('vignette'),
      loadFill: $('load-fill'),
      loadText: $('load-text'),
      minimap: $('minimap'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.lastHint = undefined;
    this.vig = 0;
    this.prev = {};
    this.bannerTimer = null;
  }

  setLoading(p, text) {
    this.el.loadFill.style.width = `${Math.round(p * 100)}%`;
    if (text) this.el.loadText.textContent = text;
  }

  screen(name) {
    for (const s of SCREENS) $('screen-' + s).classList.toggle('hidden', s !== name);
  }

  showHud(v) {
    this.el.hud.classList.toggle('hidden', !v);
  }

  // cada fase escolhe o que aparece. slots: macas e vagalumes (fase 1); carry: { icon, max } o que vai no balde
  configure({ goal, clock, slots = false, carry = null, crosshair = false, roar = 'Rugido', vignette = 'shadow' }) {
    const e = this.el;
    e.goal.className = `panel goal ${goal.theme}`;
    e.goalIcon.innerHTML = goal.icon;
    e.goalLabel.textContent = goal.label;
    e.clockPanel.className = `panel clock ${clock.theme}`;
    e.clockFrom.innerHTML = clock.from;
    e.clockTo.innerHTML = clock.to;
    e.inventory.classList.toggle('hidden', !slots && !carry);
    e.slotApples.classList.toggle('hidden', !slots);
    e.slotFire.classList.toggle('hidden', !slots);
    e.slotCarry.classList.toggle('hidden', !carry);
    if (carry) {
      e.carryIcon.innerHTML = carry.icon;
      e.carryMax.textContent = `/${carry.max}`;
      this.carryCapacity = carry.max;
    }
    e.crosshair.classList.toggle('hidden', !crosshair);
    e.roar.classList.toggle('hidden', !roar);
    if (roar) e.roarText.textContent = roar;
    e.vignette.className = vignette;
    this.prev = {};
    this.hint(null);
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

  setGoal(frac, text, danger = false) {
    const e = this.el;
    e.goalFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    this._set('goal', e.goalValue, text, e.goal);
    e.goal.classList.toggle('danger', danger);
  }

  setClock(text, frac) {
    this.el.clock.textContent = text;
    this.el.clockFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  setSlots(apples, fireflies, capacity) {
    const e = this.el;
    this._set('apples', e.apples, apples, e.slotApples);
    this._set('fire', e.fireflies, fireflies, e.slotFire);
    e.slotApples.classList.toggle('empty', apples === 0);
    e.slotFire.classList.toggle('full', fireflies >= capacity);
  }

  setCarry(n) {
    const e = this.el;
    this._set('carry', e.carry, n, e.slotCarry);
    e.slotCarry.classList.toggle('full', n >= this.carryCapacity);
  }

  setRoar(cooldown, max) {
    const e = this.el;
    const frac = 1 - cooldown / max;
    e.roarRing.style.strokeDashoffset = `${176 * (1 - Math.min(1, frac))}`;
    e.roar.classList.toggle('ready', cooldown <= 0);
    e.roar.classList.toggle('cooling', cooldown > 0);
  }

  update(dt) {
    this.vig = Math.max(0, this.vig - dt * 1.5);
    this.el.vignette.style.opacity = this.vig.toFixed(3);
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

  // letreiro grande no meio da tela (inicio da fase, momentos especiais)
  banner(html, dur = 2.4) {
    const b = this.el.banner;
    b.innerHTML = html;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('show'), dur * 1000);
  }

  flash(amount = 0.8) {
    this.vig = Math.max(this.vig, amount);
  }

  // map: { cx, cz, radius, yaw, ogre: {x, z, yaw}, draw(ctx, S, time) } — draw recebe coordenadas do mundo * S
  minimap(map, time) {
    const c = this.mm;
    const W = this.el.minimap.width, R = W / 2;
    const S = (R - 8) / map.radius;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath();
    c.arc(R, R, R - 1, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = map.background ?? 'rgba(8,10,22,0.85)';
    c.fillRect(0, 0, W, W);
    c.translate(R, R);
    c.rotate(map.yaw); // frente da camera aponta para cima
    c.translate(-map.cx * S, -map.cz * S);
    map.draw(c, S, time);
    const o = map.ogre;
    c.translate(o.x * S, o.z * S);
    c.rotate(-o.yaw);
    c.fillStyle = '#ffffff';
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(0, 6);
    c.lineTo(4, -4);
    c.lineTo(-4, -4);
    c.closePath();
    c.stroke();
    c.fill();
    c.restore();
  }

  // r: { win, stars, title, sub, stats: [[rotulo, valor]], next: boolean }
  showEnd(r) {
    $('end-title').textContent = r.title;
    $('end-sub').textContent = r.sub;
    $('end-stars').innerHTML = r.win
      ? [0, 1, 2].map((i) => `<span class="${i < r.stars ? '' : 'off'}">★</span>`).join('')
      : '';
    $('end-stats').innerHTML = r.stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('btn-next').classList.toggle('hidden', !r.next);
    $('btn-restart').classList.toggle('primary', !r.next);
    this.screen('end');
  }
}
