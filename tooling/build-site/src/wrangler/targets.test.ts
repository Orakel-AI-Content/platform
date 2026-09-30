import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { WORKER_BASE_CONFIG } from '../paths.ts';
import { parseJsonc } from './jsonc.ts';
import { cloudflareConfig, localConfig, readBaseConfig, renderConfig } from './targets.ts';

const input = {
  site: 'exemplo-a',
  domain: 'exemplo-a.com.br',
  workerMain: '/app/apps/blog/worker/src/index.ts',
  assetsDir: './site',
};

describe('parseJsonc', () => {
  it('tira comentários e vírgulas finais sem mexer em strings', () => {
    expect(
      parseJsonc('{\n // c\n "a": "http://x // y", /* b */ "b": [1, 2,],\n "c": "/* z */",\n}'),
    ).toEqual({ a: 'http://x // y', b: [1, 2], c: '/* z */' });
    expect(parseJsonc('{"a": "aspas \\" e // dentro"}')).toEqual({ a: 'aspas " e // dentro' });
  });
});

describe('alvos do wrangler.jsonc', async () => {
  const base = readBaseConfig(await readFile(WORKER_BASE_CONFIG, 'utf8'));

  it('cloudflare: domínio próprio, Analytics Engine, sem ALLOW_COUNTRY_OVERRIDE nem ae-sim', () => {
    const config = cloudflareConfig(base, input);
    expect(config).toMatchObject({
      name: 'orakel-exemplo-a',
      main: input.workerMain,
      routes: [{ pattern: 'exemplo-a.com.br', custom_domain: true }],
      vars: { SITE_ID: 'exemplo-a' },
      assets: { directory: './site', run_worker_first: ['/_e/*'], not_found_handling: '404-page' },
      analytics_engine_datasets: [{ binding: 'EVENTS', dataset: 'events' }],
    });
    const text = renderConfig(config, 'cloudflare');
    expect(text).not.toContain('ALLOW_COUNTRY_OVERRIDE');
    expect(text).not.toContain('ae-sim');
    expect(text).not.toContain('$schema');
  });

  it('local: EVENTS pelo ae-sim e X-Test-Country aceito', () => {
    const config = localConfig(base, input);
    expect(config).toMatchObject({
      name: 'orakel-exemplo-a',
      services: [{ binding: 'EVENTS', service: 'ae-sim' }],
      vars: { SITE_ID: 'exemplo-a', ALLOW_COUNTRY_OVERRIDE: 'true' },
    });
    expect(config).not.toHaveProperty('analytics_engine_datasets');
    expect(config).not.toHaveProperty('routes');
  });

  it('o arquivo gerado é JSONC válido', () => {
    expect(parseJsonc(renderConfig(localConfig(base, input), 'local'))).toMatchObject({
      name: 'orakel-exemplo-a',
    });
  });
});
