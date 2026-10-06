import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route.ts';

// A rota só traduz: sessão → 401, recusa do domínio → 403, arquivo → download. O conteúdo e
// o papel estão nos testes de contrato (test/contract/sites.contract.test.ts).

const mocks = vi.hoisted(() => ({ currentActor: vi.fn(), exportSitesTfvars: vi.fn() }));

vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({ getDb: () => ({ db: {} }) }));
vi.mock('@/domain/sites/sites.ts', () => ({
  exportSitesTfvars: mocks.exportSitesTfvars,
  TFVARS_FILENAME: 'sites.auto.tfvars.json',
}));

const operacao = { email: 'operacao@orakel.local', roles: ['operacao'] };

beforeEach(() => {
  mocks.currentActor.mockResolvedValue({ ok: true, value: operacao });
});

describe('download do sites.auto.tfvars.json', () => {
  it('sem sessão válida, 401', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });
    expect((await GET()).status).toBe(401);
  });

  it('recusa do domínio vira 403', async () => {
    mocks.exportSitesTfvars.mockResolvedValue({
      ok: false,
      issues: [{ code: 'forbidden', message: 'Sem permissão para site.configure', path: [] }],
    });
    expect((await GET()).status).toBe(403);
  });

  it('devolve o arquivo como download, sem cache', async () => {
    mocks.exportSitesTfvars.mockResolvedValue({ ok: true, value: '{\n  "sites": {}\n}\n' });
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="sites.auto.tfvars.json"',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('{\n  "sites": {}\n}\n');
    expect(mocks.exportSitesTfvars).toHaveBeenCalledWith({}, operacao);
  });
});
