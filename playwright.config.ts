import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  baseURL: 'http://localhost:5173',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev:all',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
    // Hard guard: the E2E suite changes task status and would otherwise
    // mutate the real ShotGrid ticket via /api/sg/update-task-status.
    // Only effective if Playwright spawns the server itself
    // (reuseExistingServer=true means an already-running dev server
    // ignores these — see README "Testing safety" section).
    env: {
      SG_WRITE_DISABLED: '1',
      DB_PATH: 'data.test.db',
    },
  },
});