import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    exclude: ['**/e2e/**'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});