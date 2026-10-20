import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the built game runs from any folder or static host.
  base: './',
  build: { target: 'es2022' },
});
