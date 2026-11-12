import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadReleasesSnapshot } from './snapshot.ts';

// A leitura junta as releases e as tags que algum site usa; regras e permissão estão no
// contrato (`releases.contract.test.ts`, `sites.contract.test.ts`).

const mocks = vi.hoisted(() => ({ listReleases: vi.fn(), listSites: vi.fn() }));

vi.mock('@/domain/releases/releases.ts', () => ({ listReleases: mocks.listReleases }));
vi.mock('@/domain/sites/sites.ts', () => ({ listSites: mocks.listSites }));

const db = {} as never;
const operacao = { email: 'operacao@orakel.local', roles: ['operacao' as const] };
const forbidden = {
  ok: false,
  issues: [{ code: 'forbidden', message: 'Sem permissão', path: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadReleasesSnapshot', () => {
  it('devolve as releases e cada tag em uso uma vez, sem os sites sem release', async () => {
    const rows = [{ tag: '1.1.0' }, { tag: '1.0.0' }];
    mocks.listReleases.mockResolvedValue({ ok: true, value: rows });
    mocks.listSites.mockResolvedValue({
      ok: true,
      value: [{ release: '1.0.0' }, { release: null }, { release: '1.0.0' }],
    });

    expect(await loadReleasesSnapshot(db, operacao)).toEqual({
      ok: true,
      value: { rows, inUse: ['1.0.0'] },
    });
  });

  it('sem release.promote, devolve a recusa sem ler os sites', async () => {
    mocks.listReleases.mockResolvedValue(forbidden);

    expect(await loadReleasesSnapshot(db, operacao)).toEqual(forbidden);
    expect(mocks.listSites).not.toHaveBeenCalled();
  });

  it('a recusa de listSites volta como está', async () => {
    mocks.listReleases.mockResolvedValue({ ok: true, value: [] });
    mocks.listSites.mockResolvedValue(forbidden);

    expect(await loadReleasesSnapshot(db, operacao)).toEqual(forbidden);
  });
});
