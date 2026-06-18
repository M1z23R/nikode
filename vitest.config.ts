import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts', 'electron/**/*.spec.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/app/**/*.ts', 'electron/services/**/*.js'],
      exclude: ['src/**/*.spec.ts', 'electron/**/*.spec.js', 'src/main.ts', 'src/app/app.config.ts'],
    },
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
});
