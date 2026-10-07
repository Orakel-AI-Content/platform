import { beforeAll, describe, expect, it, vi } from 'vitest';

import { GET as previewSnapshot } from './preview-snapshot/route.ts';
import { GET as buildSnapshot } from './snapshot/route.ts';

// Cada rota aceita só o token do seu consumidor; a recusa vem antes de abrir o banco.

const BUILD_TOKEN = 'b'.repeat(32);
const PREVIEW_TOKEN = 'p'.repeat(32);

beforeAll(() => {
  for (const [name, value] of Object.entries({
    DATABASE_URL: 'postgres://orakel:x@localhost:5432/orakel',
    ACCESS_TEAM_DOMAIN: 'orakel.cloudflareaccess.com',
    ACCESS_JWKS_URL: 'https://orakel.cloudflareaccess.com/cdn-cgi/access/certs',
    ACCESS_AUD: 'aud',
    EXPORT_BUILD_TOKEN: BUILD_TOKEN,
    EXPORT_PREVIEW_TOKEN: PREVIEW_TOKEN,
    GENERATOR_TOKEN: 'g'.repeat(32),
    S3_ENDPOINT: 'http://localhost:8333',
    S3_ACCESS_KEY_ID: 'k',
    S3_SECRET_ACCESS_KEY: 's',
    PREVIEW_BASE_URL: 'https://preview.orakel.localhost',
  })) {
    vi.stubEnv(name, value);
  }
});

function call(route: typeof buildSnapshot, token: string): Promise<Response> {
  const request = new Request('http://backoffice/api/export/v1/sites/exemplo-a/snapshot', {
    headers: { authorization: `Bearer ${token}` },
  });
  return route(request, { params: Promise.resolve({ site: 'exemplo-a' }) });
}

describe('tokens da API de exportação', () => {
  it('o snapshot de visualização recusa o token do build', async () => {
    expect((await call(previewSnapshot, BUILD_TOKEN)).status).toBe(401);
  });

  it('o snapshot do build recusa o token da visualização', async () => {
    expect((await call(buildSnapshot, PREVIEW_TOKEN)).status).toBe(401);
  });
});
