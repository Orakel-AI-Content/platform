import { defineConfig, devices } from '@playwright/test';

// E2E contra o ambiente local (pnpm local:up && pnpm local:seed): Caddy + access-mock +
// backoffice-web. Só local ou no e2e.yml (manual). O certificado é da CA interna do Caddy.
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://admin.orakel.localhost',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
