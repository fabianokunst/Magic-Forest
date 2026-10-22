// Fase 4 — A Trilha das Flores-Lua. Medidas em metros, na escala da floresta.

export const MOON = {
  seconds: 150,               // 19:00 -> 22:00
  cabin: { x: 0, z: 0 },      // a cabana do vizinho: o jardim fica em volta dela
  start: { x: -8, z: 5 },     // onde o ogro comeca (ao lado da cabana, no comeco da trilha)
  sky: [0.95, 1],             // hora do dia da floresta: comeco da noite -> noite (0 dia, 0.5 por do sol, 1 noite)
  corridor: 14,               // o ogro pode se afastar ate isto da trilha (fora da cabana e da clareira)
  moonlight: 10,              // luar em volta do ogro (sem ele, longe das flores o ogro some no escuro)

  flowers: {
    from: 12,                 // a primeira flor fica a isto do comeco da trilha
    step: 6.5,                // distancia entre as flores ao longo da trilha
    trail: 15,                // flores na trilha
    glade: 5,                 // flores na Clareira da Lua, no fim da trilha
    side: 2.4,                // afastamento do meio da trilha, alternando os lados (passando pelo meio, nao colhe)
  },
  bucket: 7,                  // quantas flores cabem no balde
  pass: 14,                   // plantou pelo menos isto quando o tempo acaba: passa com 1 estrela
  great: 30,                  // segundos sobrando para ganhar 3 estrelas
  reach: 1.7,                 // distancia para colher uma flor
  garden: 9,                  // perto assim da cabana, o ogro planta todas as flores do balde
  plantEvery: 0.16,           // segundos entre uma flor voando para o canteiro e a proxima

  // luz que as sombras nao atravessam (raio)
  light: { flower: 5.5, garden: 11, lamp: 6 },

  thief: {
    unit: 2.2,                // tamanho em relacao as sombras da casinha
    first: 5,                 // segundos ate a primeira aparecer
    max: [2, 4],              // quantas ao mesmo tempo, do comeco ao fim da fase
    every: 7,                 // aparece mais uma a cada tantos segundos (ate o maximo)
    near: [13, 22],           // nasce a esta distancia do ogro, no escuro
    sense: [9, 2.5],          // sente o brilho do balde a esta distancia: base + por flor no balde
    speed: [4.2, 4.8],        // correndo atras do balde (o ogro anda a 2,9 e corre a 5,75)
    flee: [5.2, 3.4],         // fugindo com a flor: comeca rapida e vai cansando
    escape: 6,                // segundos ate largar a flor no mato e sumir
    touch: 1.5,               // encostou no ogro: rouba uma flor
    grab: 2.1,                // o ogro alcanca a ladra a esta distancia e pega a flor de volta...
    getaway: 0.8,             // ... depois deste tempo (logo depois do roubo ela escapa)
    lurk: 8,                  // sem flor no balde, ficam rondando a esta distancia
    respawn: 3,
  },

  roar: { cooldown: 8, radius: 7, lock: 0.8 },
};
