import path from 'node:path';
import { fileURLToPath } from 'node:url';

import nextEnv from '@next/env';
import { defineConfig, devices } from '@playwright/test';

// Variáveis do .env.local da raiz (como no next.config.ts): o E2E da mídia (#53) lê o banco
// e o S3 pelo domínio, e o turbo não repassa essas variáveis ao test:e2e.
// @next/env é CommonJS: fora do Next, só o import padrão funciona.
nextEnv.loadEnvConfig(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));

// Banco do par isolado (pnpm local:isolated): os specs e a limpeza abrem o banco pela
// DATABASE_URL do env.ts do app. O config roda no processo principal e em cada worker.
if (process.env.E2E_DATABASE_URL) process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;

// E2E contra o ambiente local (pnpm local:up && pnpm local:seed): Caddy + access-mock +
// backoffice-web. Só local ou no e2e.yml (manual). O certificado é da CA interna do Caddy.
// Sessões em paralelo dividem a máquina: 2 workers por padrão (E2E_WORKERS muda). Os testes
// @perf semeiam milhares de linhas e medem tempo; fora do CI só rodam com E2E_PERF=1.
const runPerf = Boolean(process.env.CI) || process.env.E2E_PERF === '1';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS ?? 2),
  ...(runPerf ? {} : { grepInvert: /@perf/ }),
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://admin.orakel.localhost',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
