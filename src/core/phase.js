import { readControls } from './input.js';

// Base das fases. Cada fase tem a sua cena, o seu ogro e a sua camera, e segue este ciclo:
//   reset() -> 'menu' (camera girando no fundo das telas) -> start() -> 'playing' <-> 'paused'
//   -> 'won' | 'lost' (comemoracao) -> app.phaseEnded(resultado)
export class Phase {
  constructor(app) {
    this.app = app;
    this.hud = app.hud;
    this.sfx = app.sfx;
    this.input = app.input;
    this.camera = app.camera;
    this.state = 'menu';
    this.clock = 0;
    this.pending = [];
    this.cooldowns = {};
    this.bot = null; // testes automaticos: funcao (fase) -> controles
  }

  // como a camera e o pos-processamento ficam nesta fase
  get view() {
    return { fov: 55, near: 0.05, far: 220, exposure: 1.15, bloom: [0.9, 0.55, 0.8] };
  }

  enter() {}
  exit() {}

  _resetBase() {
    this.state = 'menu';
    this.pending.length = 0;
    this.cooldowns = {};
    this.hud.clearToasts();
    this.hud.hint(null);
  }

  pause() {
    if (this.state === 'playing') this.state = 'paused';
  }

  resume() {
    if (this.state === 'paused') this.state = 'playing';
  }

  get playing() {
    return this.state === 'playing';
  }

  get over() {
    return this.state === 'won' || this.state === 'lost';
  }

  later(t, fn) {
    this.pending.push({ t, fn });
  }

  // limita a repeticao de avisos
  once(key, cooldown) {
    if ((this.cooldowns[key] ?? -Infinity) > this.clock) return false;
    this.cooldowns[key] = this.clock + cooldown;
    return true;
  }

  _tickPending(dt) {
    this.clock += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        p.fn();
      }
    }
  }

  readControls() {
    return this.bot ? this.bot(this) : readControls(this.input, this.rig);
  }

  // dica padrao quando o mouse ainda nao esta preso na tela
  needsLockHint() {
    if (this.input.locked || this.bot) return false;
    this.hud.hint('Clique na tela para controlar a câmera');
    return true;
  }

  // r: { win, stars, title, sub, stats }
  finish(r, delay = 2.4) {
    this.state = r.win ? 'won' : 'lost';
    this.result = r;
    this.input.releaseLock();
    this.hud.hint(null);
    this.ogre.setMode(r.win ? 'celebrate' : 'sad');
    if (r.win) this.sfx.win();
    else this.sfx.lose();
    this.later(delay, () => this.app.phaseEnded(this, r));
  }
}

// relogio do HUD: minutos desde a meia-noite -> "HH:MM"
export function clockText(mins) {
  const m = Math.floor(mins);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// estrelas: 3 se sobrou bastante tempo, 2 se cumpriu tudo, 1 se passou raspando
export function starsFor({ complete, timeLeft, great }) {
  if (!complete) return 1;
  return timeLeft >= great ? 3 : 2;
}
