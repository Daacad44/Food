import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
config({ path: '.env.local', quiet: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ||= process.cwd() + '/.local/ms-playwright';
const url = new URL(process.env.DATABASE_URL!);
if (url.hostname !== '127.0.0.1') throw new Error('Browser tests require a local test database');
url.pathname = '/botan_test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}),
    },
  },
  webServer: {
    command: 'npm run start -- --port 3001',
    url: 'http://localhost:3001/api/v1/health',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      DATABASE_URL: url.toString(),
      DIRECT_URL: url.toString(),
      NEXT_PUBLIC_APP_URL: 'http://localhost:3001',
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
