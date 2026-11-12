import type { JobHelpers } from 'graphile-worker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ReleasesModule from '../../domain/releases/releases.ts';

import type { Db } from '../../db/client.ts';
import { fakeRuntime } from '../../domain/builds/fake-runtime.ts';
import type { BuildSettings } from '../../domain/builds/plan.ts';
import { createCheckReleaseImageTask, missingLocalImageReason } from './check-release-image.ts';
import type { ReleaseDriver } from './release-run.ts';

// As transições são espionadas; o banco de verdade fica no contrato (releases.contract.test.ts).
const mocks = vi.hoisted(() => ({
  loadReleaseRun: vi.fn(),
  recordReleaseImagePulled: vi.fn(),
  recordReleaseImagePullFailed: vi.fn(),
}));
vi.mock('../../domain/releases/releases.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof ReleasesModule>()),
  ...mocks,
}));

const db = {} as Db;
const NOW = Date.parse('2026-11-11T12:00:00Z');
const settings = {
  image: 'ghcr.io/orakel-ai-content/site-builder',
  defaultTag: 'local',
} as BuildSettings;
const SOURCE = 'ghcr.io/orakel-ai-content/site-builder:local';
const github = { kind: 'github' } as ReleaseDriver;
const IMAGE = 'ghcr.io/orakel-ai-content/site-builder:1.2.0';

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

function helpers(attempts = 1, maxAttempts = 5) {
  const logger = { info: vi.fn(), warn: vi.fn() };
  const asHelpers = {
    logger,
    job: { attempts, max_attempts: maxAttempts },
  } as unknown as JobHelpers;
  return { logger, asHelpers };
}

function run(
  options: Parameters<typeof fakeRuntime>[0],
  h = helpers(),
  driver: ReleaseDriver = github,
) {
  const fake = fakeRuntime(options);
  const done = createCheckReleaseImageTask({
    db,
    runtime: fake.runtime,
    settings,
    driver,
    now: () => NOW,
  })({ tag: '1.2.0' }, h.asHelpers);
  return { fake, done, logger: h.logger };
}

describe('check-release-image', () => {
  it('release em baixando: baixa SITE_BUILDER_IMAGE:<tag> e marca disponivel', async () => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'baixando', runId: '42' });
    const { fake, done } = run({ image: false, pull: 'ok' });
    await done;

    expect(fake.pulled).toEqual([IMAGE]);
    expect(mocks.recordReleaseImagePulled).toHaveBeenCalledWith(db, '1.2.0', new Date(NOW));
    expect(mocks.recordReleaseImagePullFailed).not.toHaveBeenCalled();
  });

  it('erro do pull antes da última tentativa lança para o Graphile Worker repetir, sem gravar', async () => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'baixando', runId: '42' });
    const { done } = run({ image: false, pull: 'error' }, helpers(4, 5));

    await expect(done).rejects.toThrow('toomanyrequests');
    expect(mocks.recordReleaseImagePulled).not.toHaveBeenCalled();
    expect(mocks.recordReleaseImagePullFailed).not.toHaveBeenCalled();
  });

  it('erro do pull na última tentativa: falhou com o motivo do runtime', async () => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'baixando', runId: '42' });
    const { done, logger } = run({ image: false, pull: 'error' }, helpers(5, 5));
    await done;

    expect(mocks.recordReleaseImagePullFailed).toHaveBeenCalledWith(
      db,
      '1.2.0',
      'Não foi possível baixar a imagem: toomanyrequests',
      new Date(NOW),
    );
    expect(mocks.recordReleaseImagePulled).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('toomanyrequests'));
  });

  it('imagem recusada pelo registry: falhou já na primeira tentativa, sem repetir', async () => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'baixando', runId: '42' });
    const { done } = run({ image: false, pull: 'unavailable' }, helpers(1, 5));
    await done;

    expect(mocks.recordReleaseImagePullFailed).toHaveBeenCalledWith(
      db,
      '1.2.0',
      'Não foi possível baixar a imagem: error from registry: denied',
      new Date(NOW),
    );
    expect(mocks.recordReleaseImagePulled).not.toHaveBeenCalled();
  });

  it('pull sem erro que não traz a imagem conta como falha', async () => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'baixando', runId: '42' });

    await expect(run({ image: false, pull: 'absent' }).done).rejects.toThrow(/não está no host/);

    const last = run({ image: false, pull: 'absent' }, helpers(5, 5));
    await last.done;
    expect(mocks.recordReleaseImagePullFailed).toHaveBeenCalledWith(
      db,
      '1.2.0',
      expect.stringContaining(`${IMAGE} não está no host`),
      new Date(NOW),
    );
    expect(mocks.recordReleaseImagePulled).not.toHaveBeenCalled();
  });

  it.each(['descartada', 'gerando', 'disponivel', 'falhou'])(
    'release em %s: ignorada com log, sem baixar nem gravar',
    async (pipelineState) => {
      mocks.loadReleaseRun.mockResolvedValue({ pipelineState, runId: '42' });
      const { fake, done, logger } = run({ image: true, pull: 'ok' });
      await done;

      expect(fake.pulled).toEqual([]);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`release em ${pipelineState}`),
      );
      expect(mocks.recordReleaseImagePulled).not.toHaveBeenCalled();
      expect(mocks.recordReleaseImagePullFailed).not.toHaveBeenCalled();
    },
  );

  describe('driver local (ADR 0023)', () => {
    const local: ReleaseDriver = { kind: 'local' };

    it('etiqueta SITE_BUILDER_IMAGE:SITE_BUILDER_TAG como a versão, sem pull', async () => {
      mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'baixando', runId: null });
      const { fake, done } = run({ image: true }, helpers(), local);
      await done;

      expect(fake.tagged).toEqual([{ source: SOURCE, target: IMAGE }]);
      expect(fake.pulled).toEqual([]);
      expect(mocks.recordReleaseImagePulled).toHaveBeenCalledWith(db, '1.2.0', new Date(NOW));
      expect(mocks.recordReleaseImagePullFailed).not.toHaveBeenCalled();
    });

    it('sem a imagem de origem no host: falhou já na primeira tentativa, mandando rodar pnpm local:images', async () => {
      mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'baixando', runId: null });
      const { fake, done } = run({ image: false }, helpers(1, 5), local);
      await done;

      expect(fake.tagged).toEqual([]);
      expect(mocks.recordReleaseImagePullFailed).toHaveBeenCalledWith(
        db,
        '1.2.0',
        missingLocalImageReason(SOURCE),
        new Date(NOW),
      );
      expect(missingLocalImageReason(SOURCE)).toContain('pnpm local:images');
      expect(mocks.recordReleaseImagePulled).not.toHaveBeenCalled();
    });
  });

  it('release não registrada: só avisa', async () => {
    mocks.loadReleaseRun.mockResolvedValue(undefined);
    const { fake, done, logger } = run({ image: true });
    await done;

    expect(fake.pulled).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/não registrada/));
  });
});
