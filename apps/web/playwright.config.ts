import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    { name: '360x800', use: { browserName: 'chromium', viewport: { width: 360, height: 800 } } },
    { name: '768x1024', use: { browserName: 'chromium', viewport: { width: 768, height: 1024 } } },
    { name: '1366x768', use: { browserName: 'chromium', viewport: { width: 1366, height: 768 } } }
  ]
});
