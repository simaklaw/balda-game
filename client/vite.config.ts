import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  // Относительные пути обязательны для zip-архивов Яндекс/VK/OK:
  // площадки хостят игру во вложенном каталоге, абсолютные пути
  // уходят в корень чужого origin и дают белый экран.
  base: './',
  resolve: {
    alias: {
      '@balda/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2019', // запас по старым Android WebView
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
