import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

// Variáveis do .env.local da raiz (como no next.config.ts): o E2E da mídia (#53) lê o banco
// e o S3 pelo domínio, e o turbo não repassa essas variáveis ao test:e2e.
loadEnvConfig(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));

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
