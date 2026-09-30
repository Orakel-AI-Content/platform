import { defineConfig, devices } from '@playwright/test';

// Páginas dos sites de exemplo (pnpm build:examples): exemplo-a e exemplo-b estáticos e a
// visualização SSR com as mesmas fixtures. Cada script usa uma faixa de portas
// (E2E_PORT_BASE), porque o Turbo roda test:a11y e test:parity em paralelo.
const base = Number(process.env.E2E_PORT_BASE ?? 4400);
const ports = { 'exemplo-a': base + 1, 'exemplo-b': base + 2, preview: base + 3 } as const;

export const SERVERS = {
  'exemplo-a': `http://127.0.0.1:${ports['exemplo-a']}`,
  'exemplo-b': `http://127.0.0.1:${ports['exemplo-b']}`,
  preview: `http://127.0.0.1:${ports.preview}`,
} as const;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { ...devices['Desktop Chrome'] },
  webServer: [
    {
      command: `node e2e/static-server.ts dist-examples/exemplo-a ${ports['exemplo-a']}`,
      url: SERVERS['exemplo-a'],
    },
    {
      command: `node e2e/static-server.ts dist-examples/exemplo-b ${ports['exemplo-b']}`,
      url: SERVERS['exemplo-b'],
    },
    {
      command: 'node dist-examples/preview/server/entry.mjs',
      url: `${SERVERS.preview}/exemplo-a/`,
      env: { CONTENT_SOURCE: 'fixture', HOST: '127.0.0.1', PORT: String(ports.preview) },
    },
  ],
});
