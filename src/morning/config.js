// Fase 2 — Sol da Manha. Medidas em metros, na escala da floresta.

export const MORNING = {
  seconds: 150,               // 07:00 -> 12:00
  center: { x: 0, z: 2 },     // clareira da cabana
  radius: 46,                 // limite da area da fase
  start: { x: 3, z: 15 },     // onde o ogro comeca
  shadows: 12,
  pass: 8,                    // transformou pelo menos isto quando o tempo acaba: passa com 1 estrela
  great: 40,                  // segundos sobrando para ganhar 3 estrelas

  // onde as sombras se escondem no comeco (distancia do centro)
  spawn: { min: 19, max: 42, gap: 7 },

  shadow: {
    unit: 2.3,                // tamanho em relacao as sombras da casinha
    fear: 9,                  // distancia em que fogem do ogro andando
    fearRun: 13,              // ... e correndo (o barulho assusta de mais longe)
    speed: 4.1,               // o ogro anda a 2,9 e corre a 5,75
    sunSlow: 0.9,             // no sol ficam um pouco mais lentas
    sunTime: 2.1,             // segundos no sol ate virar borboleta
    recover: 0.35,            // quanto recuperam por segundo de volta na sombra
  },

  roar: { cooldown: 5, radius: 10, push: 13, stun: 1.1, lock: 0.8 },
};
