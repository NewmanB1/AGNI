import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: `http://127.0.0.1:${process.env.AGNI_TEST_PORT || 8082}`,
    headless: true
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ]
});
