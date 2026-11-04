import { beforeAll, describe, expect, it, vi } from 'vitest';

import { POST } from './route.ts';

// Recusas da rota do gerador, antes de abrir o banco: token de outro consumidor e corpo
// fora do envelope. A criação em si é do teste de contrato (generated.contract.test.ts).

const BUILD_TOKEN = 'b'.repeat(32);
const PREVIEW_TOKEN = 'p'.repeat(32);
const GENERATOR_TOKEN = 'g'.repeat(32);

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('@/db/client.ts', () => ({ getDb }));

beforeAll(() => {
  for (const [name, value] of Object.entries({
    DATABASE_URL: 'postgres://orakel:x@localhost:5432/orakel',
    ACCESS_TEAM_DOMAIN: 'orakel.cloudflareaccess.com',
    ACCESS_JWKS_URL: 'https://orakel.cloudflareaccess.com/cdn-cgi/access/certs',
    ACCESS_AUD: 'aud',
    EXPORT_BUILD_TOKEN: BUILD_TOKEN,
    EXPORT_PREVIEW_TOKEN: PREVIEW_TOKEN,
    GENERATOR_TOKEN,
    S3_ENDPOINT: 'http://localhost:8333',
    S3_ACCESS_KEY_ID: 'k',
    S3_SECRET_ACCESS_KEY: 's',
    PREVIEW_BASE_URL: 'https://preview.orakel.localhost',
    LLM_MODEL: 'fixture',
  })) {
    vi.stubEnv(name, value);
  }
});

function call(body: string, token?: string): Promise<Response> {
  return POST(
    new Request('http://backoffice/api/internal/v1/contents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      body,
    }),
  );
}

const valid = JSON.stringify({ siteId: 'exemplo-a', content: { kind: 'article', blocks: [] } });

describe('POST /api/internal/v1/contents', () => {
  it.each([
    ['sem token', undefined],
    ['com o token do build', BUILD_TOKEN],
    ['com o token da visualização', PREVIEW_TOKEN],
  ])('responde 401 %s, sem abrir o banco', async (_name, token) => {
    const response = await call(valid, token);
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(getDb).not.toHaveBeenCalled();
  });

  it.each([
    ['não JSON', '{'],
    ['sem siteId', JSON.stringify({ content: { blocks: [] } })],
    ['sem blocos', JSON.stringify({ siteId: 'exemplo-a', content: { title: 'x' } })],
  ])('corpo %s responde 400 com problem()', async (_name, body) => {
    const response = await call(body, GENERATOR_TOKEN);
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(await response.json()).toMatchObject({ status: 400 });
    expect(getDb).not.toHaveBeenCalled();
  });
});
