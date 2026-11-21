import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Сохранённые скиллы дизайна (.claude) имеют собственные тесты — игра их не запускает.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
  resolve: {
    alias: {
      '@balda/shared': fileURLToPath(new URL('./shared/src/index.ts', import.meta.url)),
    },
  },
});
