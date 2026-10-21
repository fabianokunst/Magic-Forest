// Fase 1 — A Noite das Sombras.
// Coordenadas no espaco do Three.js (Y para cima). A casa fica na origem, com a porta voltada para +Z.

export const CONFIG = {
  nightSeconds: 165,        // duracao da noite (20:00 -> 06:00)
  graceSeconds: 12,         // tempo sem sombras no comeco
  waves: [0.28, 0.52, 0.78], // ondas de sombras (fracao da noite)
  worldRadius: 16.2,

  bucketCapacity: 10,

  apples: { start: 6, max: 10, throwCooldown: 0.45, speed: 8.5, range: 11 },

  roar: { cooldown: 7, radius: 3.2, lock: 0.8 },

  hearth: {
    start: 0.65,
    drain: 0.0045,          // por segundo
    perFirefly: 0.065,
    attackDrain: 0.022,     // por sombra na porta, por segundo
    lightRadius: 2.3,
    lightDps: 0.5,
  },

  lantern: {
    decay: 1 / 70,
    perFirefly: 0.34,
    baseRadius: 1.2,
    extraRadius: 2.2,
    reach: 1.0,
    lightDps: 0.6,
    drainByShadow: 0.14,
  },

  firefly: { max: 22, spawnEvery: 1.3, magnet: 1.35, catch: 0.38 },

  shadow: { speed: 1.0, aggro: 4.5, aggroCarry: 3, hitRadius: 0.5 },

  tree: { cooldown: 20, reach: 0.95 },
};

export const DOOR = { x: 0, z: 1.35, r: 0.8 };

export const HOUSE = {
  half: 0.97,               // paredes + pilares
  platformX: 1.315,
  platformZ: 1.415,
  platformH: 0.17,
  smoke: [-0.59, 3.35, -0.55],
};

// postes novos espalhados pela floresta (comecam apagados)
export const LANTERN_SPOTS = [
  [4.0, 4.5],
  [-4.5, 6.0],
  [-7.2, -1.5],
  [3.2, -6.6],
  [8.0, 1.0],
  [0.5, 9.0],
  [-2.5, -10.0],
];
