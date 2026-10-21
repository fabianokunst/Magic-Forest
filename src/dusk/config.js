// Fase 3 — Cogumelos do Entardecer. Medidas em metros, na escala da floresta.

export const DUSK = {
  seconds: 150,               // 17:30 -> 19:00
  center: { x: 76, z: 64 },   // casa do ogro, no bosque das arvores retorcidas
  radius: 36,                 // limite da area da fase
  start: { x: 64, z: 51 },    // onde o ogro comeca (fim da trilha)
  sky: [0.3, 0.84],           // hora do dia da floresta: fim da tarde -> anoitecer (0 dia, 0.5 por do sol, 1 noite)

  mushrooms: 20,
  pass: 14,                   // colheu pelo menos isto quando o tempo acaba: passa com 1 estrela
  great: 40,                  // segundos sobrando para ganhar 3 estrelas
  spawn: { min: 7, max: 33, gap: 5.5 },
  reach: 1.6,                 // distancia para pegar um cogumelo
  drop: 2,                    // quantos caem do balde quando uma sombra pega o ogro

  stalker: {
    unit: 2.2,                // tamanho em relacao as sombras da casinha
    first: 4,                 // segundos ate a primeira aparecer
    max: [2, 6],              // quantas ao mesmo tempo, do comeco ao fim da fase
    every: 8,                 // aparece mais uma a cada tantos segundos (ate o maximo)
    near: [12, 22],           // nasce a esta distancia do ogro, fora da tela
    speed: [4.2, 5.8],        // de costas para o ogro (ele anda a 2,9 e corre a 5,75)
    see: 26,                  // distancia maxima em que o olhar do ogro congela a sombra
    cone: 0.6,                // abertura do olhar (cosseno do meio-angulo: 0.6 = 53 graus para cada lado)
    touch: 1.3,
    wake: 0.2,                // segundos ate voltar a andar depois que voce olha para outro lado
    hear: 6,                  // a esta distancia da para ouvir a risadinha
    respawn: 4,
  },

  roar: { cooldown: 7, radius: 7, lock: 0.8 },
};
