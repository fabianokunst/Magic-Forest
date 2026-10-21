import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the built game runs from any folder or static host.
  base: './',
  server: { open: true },
  preview: { open: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 }, // three.js alone is over 500 kB
});
