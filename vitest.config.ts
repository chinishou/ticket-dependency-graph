import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    exclude: ['**/e2e/**'],
    // Pins DB_PATH to data.test.db before any module load so server/db.ts
    // never opens the production data.db.
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});