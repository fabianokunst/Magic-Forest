import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // porta propria para nao colidir com o projeto da raiz (5173)
  server: { port: 5180, open: true },
  preview: { port: 5181, open: true },
  build: { chunkSizeWarningLimit: 1000 }, // three.js sozinho ja passa de 500 kB
});
