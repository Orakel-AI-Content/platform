import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route.ts';

// Recusas da rota da versão corrigida antes de abrir o banco (token de outro consumidor, id e
// corpo fora do envelope) e o mapeamento das recusas do domínio em status. A gravação e a
// guarda da versão-base são do teste de contrato (generated.contract.test.ts).

const BUILD_TOKEN = 'b'.repeat(32);
const PREVIEW_TOKEN = 'p'.repeat(32);
const GENERATOR_TOKEN = 'g'.repeat(32);

const { getDb, correctForReview } = vi.hoisted(() => ({
  getDb: vi.fn(() => ({ db: {} })),
  correctForReview: vi.fn(),
}));
vi.mock('@/db/client.ts', () => ({ getDb }));
vi.mock('@/domain/content/generated.ts', () => ({ correctForReview }));

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
beforeEach(() => {
  getDb.mockClear();
  correctForReview.mockReset();
});

function call(body: string, token?: string, id = '7'): Promise<Response> {
  return POST(
    new Request(`http://backoffice/api/internal/v1/contents/${id}/versions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      body,
    }),
    { params: Promise.resolve({ id }) },
  );
}

const valid = JSON.stringify({
  siteId: 'exemplo-a',
  baseVersion: 1,
  content: { kind: 'article', blocks: [] },
});

describe('POST /api/internal/v1/contents/[id]/versions', () => {
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
    ['não JSON', '{', '7'],
    ['sem baseVersion', JSON.stringify({ siteId: 'exemplo-a', content: { blocks: [] } }), '7'],
    [
      'com baseVersion não inteira',
      JSON.stringify({ siteId: 'exemplo-a', baseVersion: 1.5, content: { blocks: [] } }),
      '7',
    ],
    ['sem blocos', JSON.stringify({ siteId: 'exemplo-a', baseVersion: 1, content: {} }), '7'],
    ['com id não numérico', valid, 'abc'],
  ])('corpo %s responde 400 com problem()', async (_name, body, id) => {
    const response = await call(body, GENERATOR_TOKEN, id);
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(await response.json()).toMatchObject({ status: 400 });
    expect(getDb).not.toHaveBeenCalled();
  });

  it.each([
    ['site.not_found', 404],
    ['content.not_found', 404],
    ['content.base_outdated', 409],
    ['content.unchanged', 422],
    ['content.slug_invalid', 422],
  ])('recusa %s do domínio responde %i', async (code, status) => {
    correctForReview.mockResolvedValue({ ok: false, issues: [{ code, message: code, path: [] }] });

    const response = await call(valid, GENERATOR_TOKEN);

    expect(response.status).toBe(status);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
  });

  it('grava em nome do gerador e responde 201 com a nova versão', async () => {
    correctForReview.mockResolvedValue({ ok: true, value: { id: 7, version: 2 } });

    const response = await call(valid, GENERATOR_TOKEN);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 7, version: 2 });
    expect(correctForReview).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ email: 'generator' }),
      'exemplo-a',
      7,
      1,
      { kind: 'article', blocks: [] },
    );
  });
});
