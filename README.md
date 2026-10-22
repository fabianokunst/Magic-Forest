# Magic Forest

Jogo 3D no navegador (Three.js): um dia (e uma noite) na vida do ogro da floresta mágica.
Usa os modelos, as texturas e o rig de `ogro e sua casa.blend` e de `House.blend`.

São 4 fases curtas, de 2 a 3 minutos cada. Vencer uma libera a próxima, e cada fase dá até 3 estrelas.
Em todas elas aparecem as **Sombras** (as nuvens escuras de olhos brilhantes), cada vez com um comportamento diferente:

| Fase | Quando | Onde | Objetivo | As sombras… |
| --- | --- | --- | --- | --- |
| 1. A Noite das Sombras | 20:00 → 06:00 (2min45) | casinha do ogro | manter a lareira acesa até o amanhecer: vagalumes na lareira e nas lanternas, maçãs e rugido nas sombras | atacam a casa, as lanternas e o ogro |
| 2. Sol da Manhã | 07:00 → 12:00 (2min30) | clareira da cabana, na floresta | espantar 12 sombras para o sol, onde elas viram borboletas | fogem e pulam de sombra de árvore em sombra de árvore |
| 3. Cogumelos do Entardecer | 17:30 → 19:00 (2min30) | bosque vermelho em volta da casa do ogro | colher 20 cogumelos-luz antes de anoitecer | só andam quando o ogro está de costas (batatinha frita!) |
| 4. A Trilha das Flores-Lua | 19:00 → 22:00 (2min30) | trilha da cabana até a Clareira da Lua | levar as 20 flores-lua da trilha para o jardim da cabana (cabem 7 no balde) | não entram na luz das flores, mas roubam flores do balde e fogem: dá para correr atrás e pegar de volta |

As estrelas vêm da lareira ao amanhecer (fase 1) ou do tempo que sobrou (fases 2, 3 e 4). Também dá para passar
"raspando", com 1 estrela, se o tempo acabar com pelo menos 8 borboletas (fase 2), 14 cogumelos (fase 3)
ou 14 flores no jardim (fase 4).

Na fase 4, cada flor ainda na trilha ilumina o caminho, e as sombras não entram na luz. Quem colhe primeiro as flores
do fim da trilha volta para a cabana pelo pedaço ainda iluminado; quem colhe as de perto volta no escuro.

## Jogar

- **Online:** https://fabianokunst.github.io/Magic-Forest/ (o GitHub Pages publica a branch `main` sozinho).
- **VS Code:** botão direito no `index.html` → *Open with Live Server*.
- **Windows:** dois cliques em `Jogar.bat` (na primeira vez ele instala as dependências; precisa do Node.js).
- **Terminal:** `npm install` e depois `npm run dev`. `npm run build` gera o site pronto em `dist/`.

No Live Server e no GitHub Pages o three.js vem da internet (CDN), definido no `<script type="importmap">`
do `index.html`. Ao atualizar o three no `package.json`, troque a versão lá também.
O `index.html` não abre com dois cliques: o navegador bloqueia o jogo em `file://`.

**Controles:** `W A S D` andar (em relação à câmera) · `Shift` correr · `Mouse` câmera (clique na tela para prender o cursor)
· `Espaço` rugido · `Esc` pausa · `M` som. Só na fase 1: `Clique` joga maçã, `E` acende lanterna ou sacode macieira.

O progresso (estrelas) fica salvo no navegador. Na URL, `?fase=2` abre direto a fase 2 (e libera as anteriores).

## Ajustar a dificuldade

Cada fase tem um arquivo de configuração com os números comentados:

- `src/night/config.js`: duração da noite, quanto a lareira gasta, ondas de sombras, lanternas, maçãs.
- `src/morning/config.js`: quantas sombras, quanto tempo no sol até virar borboleta, velocidade, rugido.
- `src/dusk/config.js`: quantos cogumelos, quantas sombras e com que velocidade, alcance do olhar do ogro.
- `src/moon/config.js`: quantas flores e onde, quantas cabem no balde, alcance da luz, velocidade e quantidade das sombras ladras.

## Atualizar os modelos depois de mexer no Blender

```bash
npm run export-models   # floresta: public/models/*.glb e public/textures/*.webp (dos dois .blend)
npm run export-ogre     # casinha da fase 1 e o ogro com as animações: public/ogre/
```

Os dois rodam o Blender em segundo plano (os `.blend` nunca são salvos). O primeiro reduz as texturas para 1024 px
em WebP, converte os materiais, transforma as folhas em partículas da árvore retorcida em geometria e comprime
com Draco (o que vai em cada modelo fica em `ASSETS`, no topo de `tools/export_assets.py`). O segundo monta as
animações do ogro a partir das poses do pose library e grava as posições das árvores e luzes da casinha
(detalhes no começo de `tools/export_ogre.py`).
Se o Blender não estiver em `C:\Program Files\Blender Foundation\Blender 5.2`, defina a variável `BLENDER`.
Os `.blend` e a pasta `texture/` não vão para o GitHub (estão no `.gitignore`): ficam só no PC, na raiz do projeto.

As borboletas (fase 2), os cogumelos (fase 3) e as flores-lua (fase 4) são feitos por código, com formas simples.
Dá para trocar por modelos do Blender depois.

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `src/main.js`, `src/phases.js` | início, telas, troca de fases e textos de cada fase |
| `src/core/` | o que todas as fases usam: ogro, câmera, controles, HUD, sons, partículas, visual das sombras |
| `src/night/` | fase 1: casinha, vagalumes, lanternas, maçãs, sombras da noite |
| `src/forest/` | cenário das fases 2, 3 e 4: terreno, árvores, grama, casas, céu, dia/entardecer/noite |
| `src/morning/` | fase 2: mapa de sol e sombra, sombras do dia, borboletas |
| `src/dusk/` | fase 3: cogumelos, sombras da batatinha frita |
| `src/moon/` | fase 4: trilha e jardim, flores-lua, sombras ladras |
| `public/ogre/` | casinha e ogro exportados de `ogro e sua casa.blend` |
| `public/models`, `public/textures` | floresta exportada dos dois `.blend` |
| `tools/` | exportação Blender → web |
