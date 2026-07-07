import { defineConfig } from 'vite';

// base: '/amo/' → абсолютные пути к ассетам от подпапки репозитория.
// Нужно для GitHub Pages project pages на https://<user>.github.io/amo/:
// работает и без завершающего слэша (/amo), в отличие от относительного './'.
// Внимание: путь захардкожен под репозиторий `amo`. При переезде на корень
// домена или другой репозиторий — поменять на '/' или '/<new-repo>/'.
export default defineConfig({
  base: '/amo/',
  build: {
    outDir: 'dist',
    // один бандл проще деплоить на GitHub Pages
    assetsInlineLimit: 0,
  },
});
