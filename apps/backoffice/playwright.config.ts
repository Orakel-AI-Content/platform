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
// backoffice-web. Local (por área) ou no e2e.yml (suíte completa em todo PR, ADR 0016 da raiz).
// O certificado é da CA interna do Caddy. No CI, o relatório HTML vira artefato de cada shard.
// Sessões em paralelo dividem a máquina: 2 workers por padrão (E2E_WORKERS muda). Os testes
// @perf semeiam milhares de linhas e medem tempo; fora do CI só rodam com E2E_PERF=1.
const runPerf = Boolean(process.env.CI) || process.env.E2E_PERF === '1';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS ?? 2),
  // No runner Linux, cada build de site cria interfaces de rede no host e o Chromium aborta a
  // navegação em curso (net::ERR_NETWORK_CHANGED); no CI, o teste repete (ADR 0016 da raiz).
  retries: process.env.CI ? 2 : 0,
  ...(runPerf ? {} : { grepInvert: /@perf/ }),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://admin.orakel.localhost',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
