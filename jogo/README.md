# A Noite do Ogro

Jogo de ação e sobrevivência em terceira pessoa feito com o ogro e o cenário de `ogro e sua casa.blend`.
Roda no navegador (Three.js) e usa os modelos, as texturas e o rig do arquivo original.

## A ideia

Toda noite, as **Sombras** saem da floresta mágica para apagar as luzes da casinha do ogro.
O jogador controla o ogro, com o balde de maçãs no ombro, e precisa manter a **lareira** acesa até o amanhecer
(4 minutos, das 20:00 às 06:00).

| Elemento do cenário | Papel no jogo |
| --- | --- |
| Casa | Base a defender. A lareira é a "vida": cai sozinha com o tempo e cai rápido quando há sombras na porta |
| Vagalumes | Recurso de luz. O ogro os pega com o balde (até 10) e entrega na porta (+lareira) ou nas lanternas |
| Postes com lanterna | Zonas seguras: queimam as sombras que entram na luz. Apagam aos poucos e precisam de vagalumes |
| Balde de maçãs | Munição. Clique para arremessar (mira assistida). Maçãs que erram ficam no chão para reaproveitar |
| Macieiras | Sacudir (E) derruba 2–3 maçãs; depois a árvore fica um tempo sem fruta |
| Pose de braços erguidos do pose library | **Rugido**: espanta todas as sombras por perto (recarga de 7 s) |

O jogo gira em torno destas decisões:

- Ir longe atrás de vagalumes, sabendo que o balde brilhando atrai sombras e que um toque derruba 3 vagalumes.
- Alimentar a lareira (sobrevivência) ou acender lanternas (segurança no mapa).
- Usar maçãs, que são poucas, ou guardar o rugido, que tem recarga.

Ondas de sombras chegam por um dos pontos cardeais em 30%, 55% e 80% da noite.
Sombras grandes (3 de vida) aparecem da metade da noite em diante e vão direto para a casa.

## Controles

| Tecla | Ação |
| --- | --- |
| W A S D / setas | andar (relativo à câmera) |
| Shift | correr (gasta fôlego) |
| Mouse | câmera (clique na tela para travar o cursor) · roda = zoom |
| Clique / F | jogar maçã |
| Espaço | rugido |
| E | acender lanterna (com vagalumes) / sacudir macieira |
| Esc | pausa · M = som |

## Como rodar

Requer Node.js 18 ou mais recente.

**Jeito fácil (Windows):** dê dois cliques em `Jogar.bat`. Na primeira vez ele instala as dependências.
Depois abre o jogo no navegador. Feche a janela preta para parar.

Pelo terminal:

```bash
cd jogo
npm install
npm run dev        # abre http://localhost:5180 (ou a próxima porta livre)
```

> O `index.html` **não abre com dois cliques**: o navegador bloqueia módulos JavaScript em `file://`.
> O jogo precisa de um servidor local, que é o que o `Jogar.bat` e o `npm run dev` fazem.
> O mesmo vale para `dist/index.html`.

`npm run build` gera a versão estática em `dist/`, que pode ser publicada em qualquer servidor estático
(`npm run preview` a serve localmente).

## Reexportar do Blender

Os arquivos em `public/assets/` são gerados a partir do `.blend` por `tools/export_assets.py`
(Blender 5.2, em segundo plano; o `.blend` não é modificado):

```bash
npm run assets     # use a variável BLENDER se o blender.exe estiver em outro caminho
```

O script:

- corrige o caminho das texturas do ogro (o `.blend` apontava para `..\Ogro\texture\`);
- reduz as texturas e exporta em WebP;
- converte as partículas de folhas (53 mil) e grama em matrizes de instância (`instances.bin`);
- monta as animações do ogro a partir das poses do pose library: Idle, Walk, Run, Roar, Throw,
  Interact, Hit, Celebrate e Sad (o balde passa a seguir a mão direita);
- grava em `level.json` as posições das árvores, as luzes e o mapeamento da máscara do caminho.

Para conferir as animações em imagens: acrescente `--preview <pasta>` ao final do comando do Blender
(veja o cabeçalho do script).

## Estrutura

```
src/
  main.js       renderer, bloom, telas e loop
  game.js       regras: lareira, ritmo da noite, entradas, eventos, vitória e derrota
  world.js      cenário: chão com máscara do caminho, folhas e grama com vento, céu, luzes, colisão
  ogre.js       movimento e mistura de animações (o arremesso usa só a parte de cima do corpo)
  shadows.js    inimigos
  fireflies.js  vagalumes
  lanterns.js   postes e zonas de luz
  apples.js     maçãs (projéteis, quedas, coleta)
  camera.js     câmera em terceira pessoa
  hud.js        HUD, minimapa, avisos e telas finais
  audio.js      sons sintetizados (WebAudio, sem arquivos)
  config.js     números de balanceamento e posição dos postes novos
```

## Ajustando a dificuldade

Tudo fica em `src/config.js`:

- `nightSeconds`: duração da noite.
- `hearth.drain` / `hearth.attackDrain`: quanto a lareira perde sozinha e por sombra na porta.
- `lantern.decay`: quanto tempo uma lanterna fica acesa.
- `roar.cooldown`, `apples.start` e `apples.max`.

O ritmo de aparecimento das sombras fica em `Game._director` (`src/game.js`).
