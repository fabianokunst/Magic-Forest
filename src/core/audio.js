// Efeitos sonoros sintetizados com WebAudio (nenhum arquivo de som necessario).

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.mode = 'night'; // som ambiente: 'night' (grilos), 'day' (passarinhos), 'dusk' (os dois)
    this.evening = 0;    // no entardecer: 0 so passarinhos ... 1 so grilos
  }

  ambient(mode) {
    this.mode = mode;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this._ambient();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  get t() {
    return this.ctx.currentTime;
  }

  _env(gain, t0, a, peak, d) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  _tone(type, f0, f1, dur, vol = 0.2, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.t + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    this._env(g, t0, 0.01, vol, dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  _noise(dur, vol, filterType, f0, f1, q = 1, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.t + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = this.ctx.createGain();
    this._env(g, t0, Math.min(0.03, dur * 0.3), vol, dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  _ambient() {
    // vento baixo constante
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    // grilos a noite, passarinhos de dia
    const tick = () => {
      if (!this.ctx) return;
      const night = this.mode === 'night' || (this.mode === 'dusk' && Math.random() < this.evening);
      if (night) this._cricket();
      else this._bird();
      setTimeout(tick, night ? 700 + Math.random() * 2200 : 900 + Math.random() * 2600);
    };
    tick();
  }

  _cricket() {
    const base = 4200 + Math.random() * 600;
    for (let i = 0; i < 3; i++) this._tone('sine', base, base * 1.02, 0.035, 0.012, i * 0.07);
  }

  _bird() {
    const base = 2200 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 4);
    const up = Math.random() < 0.5;
    for (let i = 0; i < n; i++) {
      const f = base * (1 + (up ? i : n - i) * 0.06);
      this._tone('sine', f, f * (Math.random() < 0.5 ? 1.35 : 0.75), 0.07, 0.018, i * 0.11);
    }
  }

  pickup(n = 0) {
    const f = 880 * Math.pow(1.06, Math.min(n, 10));
    this._tone('sine', f, f * 1.5, 0.15, 0.12);
    this._tone('triangle', f * 2, f * 3, 0.1, 0.04, 0.03);
  }

  deliver(n) {
    for (let i = 0; i < Math.min(n, 6); i++) this._tone('sine', 520 * Math.pow(1.25, i), 520 * Math.pow(1.25, i) * 1.01, 0.25, 0.1, i * 0.06);
    this._noise(0.6, 0.06, 'lowpass', 600, 200);
  }

  lantern() {
    this._noise(0.5, 0.18, 'lowpass', 200, 1400);
    this._tone('sine', 220, 330, 0.5, 0.12);
  }

  lanternOut() {
    this._noise(0.4, 0.1, 'bandpass', 900, 200, 2);
  }

  throwApple() {
    this._noise(0.18, 0.12, 'bandpass', 600, 2400, 2);
  }

  appleHit() {
    this._tone('sine', 200, 60, 0.18, 0.25);
    this._noise(0.12, 0.12, 'lowpass', 3000, 400);
  }

  shadowDie() {
    this._noise(0.7, 0.16, 'bandpass', 1800, 150, 3);
    this._tone('sawtooth', 300, 70, 0.6, 0.05);
  }

  roar() {
    if (!this.ctx) return;
    const t0 = this.t;
    const o = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(120, t0);
    o.frequency.exponentialRampToValueAtTime(65, t0 + 0.9);
    lfo.frequency.value = 28;
    lg.gain.value = 14;
    lfo.connect(lg).connect(o.frequency);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1600, t0);
    f.frequency.exponentialRampToValueAtTime(300, t0 + 0.9);
    this._env(g, t0, 0.05, 0.5, 0.95);
    o.connect(f).connect(g).connect(this.master);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + 1.1);
    lfo.stop(t0 + 1.1);
    this._noise(0.9, 0.25, 'lowpass', 900, 120);
  }

  steal() {
    this._tone('triangle', 660, 220, 0.4, 0.12);
    this._tone('triangle', 622, 207, 0.4, 0.1, 0.05);
  }

  hurt() {
    this._tone('square', 160, 90, 0.2, 0.08);
  }

  shake() {
    this._noise(0.5, 0.2, 'bandpass', 2500, 1200, 0.8);
  }

  pop() {
    this._tone('sine', 500, 900, 0.08, 0.12);
  }

  warn() {
    this._tone('sine', 196, 196, 0.6, 0.12);
    this._tone('sine', 185, 185, 0.6, 0.08, 0.02);
  }

  denied() {
    this._tone('square', 180, 150, 0.12, 0.05);
  }

  // sombra virando borboleta
  transform() {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => this._tone('sine', f, f * 1.01, 0.35, 0.07, i * 0.06));
    this._noise(0.6, 0.05, 'highpass', 5000, 9000, 0.7, 0.05);
  }

  sizzle() {
    this._noise(0.18, 0.05, 'bandpass', 3200, 2200, 2);
  }

  // sombra assustada
  squeak() {
    const f = 850 + Math.random() * 250;
    this._tone('triangle', f, f * 1.7, 0.13, 0.06);
  }

  giggle() {
    const f = 620 + Math.random() * 160;
    [1, 1.18, 1, 1.18].forEach((k, i) => this._tone('triangle', f * k, f * k * 0.96, 0.07, 0.05, i * 0.085));
  }

  boo() {
    this._noise(0.5, 0.18, 'lowpass', 900, 150);
    this._tone('triangle', 520, 140, 0.45, 0.12);
  }

  mushroom(n = 0) {
    const f = 660 * Math.pow(1.06, Math.min(n, 12));
    this._tone('sine', f, f, 0.5, 0.09);
    this._tone('sine', f * 2.01, f * 2.01, 0.35, 0.04, 0.02);
    this._tone('triangle', f * 0.5, f * 0.75, 0.08, 0.06);
  }

  // flor-lua colhida: um sininho que sobe a cada flor no balde
  flower(n = 0) {
    const f = 880 * Math.pow(1.08, Math.min(n, 10));
    this._tone('sine', f, f * 1.01, 0.6, 0.08);
    this._tone('sine', f * 1.5, f * 1.5, 0.45, 0.04, 0.05);
    this._noise(0.25, 0.025, 'highpass', 6000, 9000, 0.7);
  }

  // flor plantada no jardim
  plant(n = 0) {
    const f = 523 * Math.pow(1.03, n % 12);
    this._tone('triangle', f, f * 1.5, 0.12, 0.07);
    this._tone('sine', f * 2, f * 2, 0.5, 0.05, 0.08);
  }

  // pegou a flor de volta da sombra
  recover() {
    [660, 880, 1320].forEach((f, i) => this._tone('sine', f, f * 1.02, 0.25, 0.08, i * 0.05));
    this._noise(0.4, 0.06, 'bandpass', 1800, 300, 2);
  }

  chime() {
    [523, 784, 1046].forEach((f, i) => this._tone('sine', f, f, 0.8, 0.07, i * 0.12));
  }

  win() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone('triangle', f, f, 0.9, 0.12, i * 0.14));
  }

  lose() {
    [392, 330, 262, 196].forEach((f, i) => this._tone('triangle', f, f * 0.98, 0.7, 0.12, i * 0.22));
  }
}
