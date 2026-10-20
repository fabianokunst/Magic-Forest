import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { open: true },
  build: { chunkSizeWarningLimit: 1000 }, // three.js sozinho ja passa de 500 kB
});
