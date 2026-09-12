import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests/e2e',
  // The suite mutates shared server state, so it runs serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',

  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Starts the API and the Vite dev server together. An already-running pair is
  // reused locally so the suite does not fight the developer's own servers.
  webServer: {
    command: 'npm run dev',
    url: WEB_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
