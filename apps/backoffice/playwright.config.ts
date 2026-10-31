import path from 'node:path';
import { fileURLToPath } from 'node:url';

import nextEnv from '@next/env';
import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

// Variáveis do .env.local da raiz (como no next.config.ts): o E2E da mídia (#53) lê o banco
// e o S3 pelo domínio, e o turbo não repassa essas variáveis ao test:e2e.
// @next/env é CommonJS: fora do Next, só o import padrão funciona.
nextEnv.loadEnvConfig(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));

// Banco do par isolado (pnpm local:isolated): os specs e a limpeza abrem o banco pela
// DATABASE_URL do env.ts do app. O config roda no processo principal e em cada worker.
if (process.env.E2E_DATABASE_URL) process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;

// Duas camadas (#474). Padrão: `telas`, contra o Next (`next start` no CI, `next dev` fora
// dele), o Postgres da DATABASE_URL e um access-mock próprio, sem Caddy, S3, worker nem
// build-runner; o globalSetup migra e semeia o banco. Os testes `@stack` precisam da pilha e
// ficam de fora. Com E2E_STACK=1 (test:e2e, local:e2e:area e e2e.yml), contra o ambiente local
// (pnpm local:up && pnpm local:seed): Caddy + access-mock + backoffice-web, com o certificado
// da CA interna do Caddy. Ali, o projeto `stack` tem só os `@stack` e é o que o E2E completo
// (e2e.yml) roda (#475); o `chromium`, a suíte inteira, fica para o local:e2e:area.
// Sessões em paralelo dividem a máquina: 2 workers por padrão (E2E_WORKERS muda). Os testes
// @perf semeiam 2.000 linhas e medem o tempo no navegador, que fora do CI depende da carga da
// máquina: ficam no projeto `perf`, registrado só na pilha, com `CI` ou E2E_PERF=1 (#461). A
// consulta com volume é medida no contrato.
const stack = process.env.E2E_STACK === '1';
const runPerf = Boolean(process.env.CI) || process.env.E2E_PERF === '1';
const chromium = { ...devices['Desktop Chrome'] };

// Portas próprias da camada `telas`, fora das do compose (8788 do access-mock).
const telasURL = `http://localhost:${process.env.E2E_TELAS_PORT ?? '3100'}`;
const accessPort = process.env.E2E_ACCESS_PORT ?? '8790';
// Lido pelo asRole (test/e2e/auth.ts) nos workers, que rodam este config de novo.
if (!stack) process.env.E2E_ACCESS_URL = `http://localhost:${accessPort}`;

const stackLayer: PlaywrightTestConfig = {
  // No runner Linux, cada build de site cria interfaces de rede no host e o Chromium aborta a
  // navegação em curso (net::ERR_NETWORK_CHANGED); no CI, o teste repete (ADR 0016 da raiz).
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'https://admin.orakel.localhost' },
  projects: [
    { name: 'chromium', grepInvert: /@perf/, use: chromium },
    { name: 'stack', grep: /@stack/, use: chromium },
    ...(runPerf ? [{ name: 'perf', grep: /@perf/, use: chromium }] : []),
  ],
};

const telasLayer: PlaywrightTestConfig = {
  globalSetup: './test/e2e/global-setup.ts',
  use: { baseURL: telasURL },
  projects: [{ name: 'telas', grepInvert: /@stack|@perf/, use: chromium }],
  webServer: [
    {
      command: 'node ../../infra/local/access-mock/server.ts',
      url: `${process.env.E2E_ACCESS_URL}/cdn-cgi/access/certs`,
      env: { PORT: accessPort },
    },
    {
      command: `pnpm exec next ${process.env.CI ? 'start' : 'dev'} --port ${new URL(telasURL).port}`,
      url: `${telasURL}/api/health`,
      // O `next start` avisa que o `output: standalone` pede o server.js, mas serve o .next; o
      // server.js do standalone exigiria copiar o .next/static, como no Dockerfile. O build do
      // CI vem do cache do turbo; o `next dev` compila cada rota na primeira visita.
      timeout: 180_000,
      env: {
        ACCESS_JWKS_URL: `${process.env.E2E_ACCESS_URL}/cdn-cgi/access/certs`,
        // /teste-de-erro e /teste-de-componentes, como no compose local.
        E2E_ERROR_ROUTE: '1',
      },
    },
  ],
};
const layer = stack ? stackLayer : telasLayer;

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS ?? 2),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  ...layer,
  use: {
    ...layer.use,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
});
