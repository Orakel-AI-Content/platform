import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadReleasesSnapshot } from './snapshot.ts';

// A leitura junta as releases, as tags que algum site usa e o estado da prévia; regras e
// permissão estão no contrato (`releases.contract.test.ts`, `sites.contract.test.ts`,
// `preview.contract.test.ts`, `rollout.contract.test.ts`).

const mocks = vi.hoisted(() => ({
  listReleases: vi.fn(),
  listSites: vi.fn(),
  readPreviewState: vi.fn(),
  latestRollout: vi.fn(),
  latestAvailableRelease: vi.fn(),
}));

vi.mock('@/domain/releases/releases.ts', () => ({
  listReleases: mocks.listReleases,
  latestAvailableRelease: mocks.latestAvailableRelease,
}));
vi.mock('@/domain/releases/rollout.ts', () => ({ latestRollout: mocks.latestRollout }));
vi.mock('@/domain/sites/sites.ts', () => ({ listSites: mocks.listSites }));
vi.mock('@/domain/preview/preview.ts', () => ({ readPreviewState: mocks.readPreviewState }));

const db = {} as never;
const operacao = { email: 'operacao@orakel.local', roles: ['operacao' as const] };
const forbidden = {
  ok: false,
  issues: [{ code: 'forbidden', message: 'Sem permissão', path: [] }],
};

const preview = {
  status: 'atualizando',
  currentRelease: '1.0.0',
  targetRelease: '1.1.0',
  failureReason: null,
  updatedAt: new Date('2026-11-12T12:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readPreviewState.mockResolvedValue(preview);
  mocks.latestRollout.mockResolvedValue({ ok: true, value: null });
  mocks.latestAvailableRelease.mockResolvedValue(null);
});

const rollout = {
  id: 1,
  targetRelease: '1.1.0',
  state: 'em_andamento',
  requestedBy: 'operacao@orakel.local',
  startedAt: new Date('2026-11-12T12:00Z'),
  finishedAt: null,
  sites: [{ siteId: 'site-a', position: 0, state: 'em_andamento', previousRelease: '1.0.0' }],
};

describe('loadReleasesSnapshot', () => {
  it('devolve as releases, cada tag em uso uma vez (sem os sites sem release), a prévia, sem atualização nem destino', async () => {
    const rows = [{ tag: '1.1.0' }, { tag: '1.0.0' }];
    mocks.listReleases.mockResolvedValue({ ok: true, value: rows });
    mocks.listSites.mockResolvedValue({
      ok: true,
      value: [{ release: '1.0.0' }, { release: null }, { release: '1.0.0' }],
    });

    expect(await loadReleasesSnapshot(db, operacao)).toEqual({
      ok: true,
      value: { rows, inUse: ['1.0.0'], preview, rollout: null, rolloutTarget: null },
    });
    expect(mocks.readPreviewState).toHaveBeenCalledWith(db);
  });

  it('devolve a última atualização e a release de destino', async () => {
    mocks.listReleases.mockResolvedValue({ ok: true, value: [] });
    mocks.listSites.mockResolvedValue({ ok: true, value: [] });
    mocks.latestRollout.mockResolvedValue({ ok: true, value: rollout });
    mocks.latestAvailableRelease.mockResolvedValue('1.1.0');

    expect(await loadReleasesSnapshot(db, operacao)).toEqual({
      ok: true,
      value: { rows: [], inUse: [], preview, rollout, rolloutTarget: '1.1.0' },
    });
    expect(mocks.latestRollout).toHaveBeenCalledWith(db, operacao);
    expect(mocks.latestAvailableRelease).toHaveBeenCalledWith(db);
  });

  it('sem release.promote, devolve a recusa sem ler os sites nem a prévia', async () => {
    mocks.listReleases.mockResolvedValue(forbidden);

    expect(await loadReleasesSnapshot(db, operacao)).toEqual(forbidden);
    expect(mocks.listSites).not.toHaveBeenCalled();
    expect(mocks.readPreviewState).not.toHaveBeenCalled();
    expect(mocks.latestAvailableRelease).not.toHaveBeenCalled();
  });

  it('a recusa de listSites volta como está', async () => {
    mocks.listReleases.mockResolvedValue({ ok: true, value: [] });
    mocks.listSites.mockResolvedValue(forbidden);

    expect(await loadReleasesSnapshot(db, operacao)).toEqual(forbidden);
  });

  it('a recusa de latestRollout volta como está', async () => {
    mocks.listReleases.mockResolvedValue({ ok: true, value: [] });
    mocks.listSites.mockResolvedValue({ ok: true, value: [] });
    mocks.latestRollout.mockResolvedValue(forbidden);

    expect(await loadReleasesSnapshot(db, operacao)).toEqual(forbidden);
  });
});
