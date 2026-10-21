import { NightPhase } from './night/phase.js';
import { MorningPhase } from './morning/phase.js';
import { DuskPhase } from './dusk/phase.js';
import { ICONS } from './core/icons.js';

const k = (...keys) => keys.map((x) => `<kbd>${x}</kbd>`).join('');

// As fases do jogo, na ordem. Os textos aparecem no menu e na tela de cada fase.
export const PHASES = [
  {
    id: 1,
    make: (app) => new NightPhase(app),
    forest: false,
    when: 'Noite',
    theme: 'night',
    icon: ICONS.moon,
    title: 'A Noite das Sombras',
    short: 'Mantenha a lareira acesa até o amanhecer.',
    story: `Toda noite, as <b class="c-shadow">Sombras</b> saem da floresta mágica para apagar as luzes da
      casinha do ogro. Pegue <b class="c-fire">vagalumes</b> com o balde, leve-os para a
      <b class="c-hearth">lareira</b> e acenda as lanternas da floresta. Se a lareira apagar, a floresta fica com elas.`,
    controls: [
      `${k('W', 'A', 'S', 'D')} andar &nbsp; ${k('Shift')} correr`,
      `${k('Mouse')} câmera &nbsp; ${k('Clique')} jogar maçã`,
      `${k('Espaço')} <b>RUGIDO</b>: espanta as sombras por perto`,
      `${k('E')} acender lanterna / sacudir macieira`,
    ],
    tips: [
      ['fire', 'Chegue perto dos vagalumes para pegá-los (até 10 no balde).'],
      ['hearth', 'Entre na porta de casa para alimentar a lareira.'],
      ['lamp', 'Lanternas acesas criam zonas seguras e queimam as sombras.'],
      ['apple', 'Maçãs derrubam sombras. Acabou? Sacuda uma macieira.'],
    ],
  },
  {
    id: 2,
    make: (app) => new MorningPhase(app),
    forest: true,
    when: 'Manhã',
    theme: 'morning',
    icon: ICONS.sun,
    title: 'Sol da Manhã',
    short: 'Espante as sombras para o sol: elas viram borboletas!',
    story: `Amanheceu! Algumas <b class="c-shadow">Sombras</b> não voltaram para casa e se esconderam na
      <b>sombra das árvores</b>. Elas fogem do ogro, mas morrem de medo do sol: na luz do dia, viram
      <b class="c-butterfly">borboletas</b>! Transforme todas antes do meio-dia.`,
    controls: [
      `${k('W', 'A', 'S', 'D')} andar &nbsp; ${k('Shift')} correr`,
      `${k('Mouse')} câmera`,
      `${k('Espaço')} <b>RUGIDO</b>: arremessa as sombras para longe`,
    ],
    tips: [
      ['shadow', 'Chegue perto e elas fogem para outra sombra.'],
      ['sun', 'Venha pelo lado da floresta: assim elas fogem para o sol.'],
      ['hearth', 'O rugido joga as sombras longe. Mire na clareira ensolarada!'],
      ['lamp', 'No minimapa, o verde-claro é sol e o escuro é sombra.'],
    ],
  },
  {
    id: 3,
    make: (app) => new DuskPhase(app),
    forest: true,
    when: 'Entardecer',
    theme: 'dusk',
    icon: ICONS.sunset,
    title: 'Cogumelos do Entardecer',
    short: 'Colha os cogumelos-luz sem tirar os olhos das sombras.',
    story: `O sol está se pondo e o ogro foi colher <b class="c-mush">cogumelos-luz</b> para a sopa.
      Mas as <b class="c-shadow">Sombras</b> estão ficando ousadas: elas <b>só se mexem quando você não
      está olhando</b>. Quando você olha, elas fecham os olhinhos e ficam paradas. Colha todos antes de anoitecer!`,
    controls: [
      `${k('W', 'A', 'S', 'D')} andar &nbsp; ${k('Shift')} correr`,
      `${k('Mouse')} olhar em volta: <b>vigie as sombras!</b>`,
      `${k('Espaço')} <b>RUGIDO</b>: espanta as sombras por perto`,
    ],
    tips: [
      ['mush', 'Os cogumelos brilham mais à medida que escurece.'],
      ['shadow', 'Gire a câmera de vez em quando: elas chegam por trás.'],
      ['hearth', 'Se uma sombra encostar no ogro, ele derruba cogumelos.'],
      ['lamp', 'No minimapa, o leque claro mostra para onde você olha.'],
    ],
  },
];
