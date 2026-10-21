# Magic Forest

Floresta 3D jogável no navegador (Three.js), montada a partir dos modelos de `House.blend` e `ogro e sua casa.blend`.

## Rodar

Online: https://fabianokunst.github.io/Magic-Forest/ (o GitHub Pages publica a branch `main` sozinho).

No VS Code, também abre com o **Live Server** (botão direito no `index.html` → *Open with Live Server*).
Nesses dois casos o three.js vem da CDN definida no `<script type="importmap">` do `index.html`;
ao atualizar o three no `package.json`, troque a versão lá também.

Com o Vite:

```bash
npm install
npm run dev        # abre em http://localhost:5173
npm run build      # gera dist/ (site estático, ~4 MB)
```

**Controles:** `WASD` andar · `Shift` correr · `Espaço` pular · `N` dia/noite · `F` modo voo (`Espaço`/`C` sobe/desce) · `Esc` pausa

Na URL: `?night` começa à noite; `?view=x,z,olharX,olharZ` posiciona a câmera.

## Atualizar os modelos depois de mexer no Blender

```bash
npm run export-models
```

Roda o Blender em segundo plano (os `.blend` nunca são salvos) e gera `public/models/*.glb` e `public/textures/*.webp`:
reduz texturas para 1024 px em WebP, aplica os nós Hue/Saturation na própria textura, converte os materiais
para Principled BSDF, transforma as folhas em partículas da árvore retorcida em geometria real e comprime com Draco.
O que vai em cada modelo fica em `ASSETS` no topo de `tools/export_assets.py`.
Se o Blender não estiver em `C:\Program Files\Blender Foundation\Blender 5.2`, defina a variável `BLENDER`.

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `tools/` | exportação Blender → web |
| `public/models`, `public/textures` | arquivos gerados pela exportação |
| `src/world/` | terreno, céu, floresta, grama, casas e postes, vagalumes, dia/noite |
| `src/player.js` | controle em primeira pessoa, colisão, voo |
| `src/main.js` | inicialização, pós-processamento (bloom), loop |
