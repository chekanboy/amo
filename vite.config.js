import { defineConfig } from 'vite';

// base: './' → относительные пути к ассетам.
// Работает и на https://<user>.github.io/amo/ (project pages),
// и на кастомном домене, и при локальном preview — не нужно менять под репозиторий.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    // один бандл проще деплоить на GitHub Pages
    assetsInlineLimit: 0,
  },
});
