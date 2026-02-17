import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
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
      '@shared': '/home/dimitrije/projects/dimitrije/nikode/shared',
    },
  },
});
