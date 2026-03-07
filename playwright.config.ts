import { defineConfig } from '@playwright/test';

const hubKey = process.env.AGNI_HUB_API_KEY || 'e2e-test-hub-key';
const port = process.env.AGNI_TEST_PORT || 8082;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    extraHTTPHeaders: {
      'x-hub-key': hubKey,
    },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ]
});
