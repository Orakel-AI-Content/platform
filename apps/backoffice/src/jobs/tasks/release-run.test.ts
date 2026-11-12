import type { JobHelpers } from 'graphile-worker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ReleasesModule from '../../domain/releases/releases.ts';

import type { Executor } from '../../db/client.ts';
import { GitHubError, type GitHubClient } from '../../lib/github.ts';
import { createReleaseRunTask, MISSING_TOKEN_REASON, RELEASE_POLL_MS } from './release-run.ts';

// As transições são espionadas; o banco de verdade fica no contrato (releases.contract.test.ts).
const mocks = vi.hoisted(() => ({
  loadReleaseRun: vi.fn(),
  recordReleaseRunStarted: vi.fn(),
  scheduleReleaseRunCheck: vi.fn(),
  recordReleaseRunSucceeded: vi.fn(),
  recordReleaseRunFailed: vi.fn(),
}));
vi.mock('../../domain/releases/releases.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof ReleasesModule>()),
  ...mocks,
}));

const db = {} as Executor;
const NOW = Date.parse('2026-11-11T12:00:00Z');
const runUrl = 'https://github.com/Orakel-AI-Content/platform/actions/runs/42';

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

function helpers(attempts = 1, maxAttempts = 5) {
  const logger = { info: vi.fn(), warn: vi.fn() };
  return { id: '7', attempts, max_attempts: maxAttempts, logger } as const;
}
const asHelpers = (h: ReturnType<typeof helpers>) =>
  ({
    logger: h.logger,
    job: { attempts: h.attempts, max_attempts: h.max_attempts },
  }) as unknown as JobHelpers;

/** GitHub falso: as respostas de cada chamada, na ordem. */
function fakeGitHub(responses: {
  dispatch?: (Awaited<ReturnType<GitHubClient['dispatchWorkflow']>> | Error)[];
  run?: (Awaited<ReturnType<GitHubClient['getRun']>> | Error)[];
}) {
  const dispatchWorkflow = vi.fn<GitHubClient['dispatchWorkflow']>(() => {
    const next = responses.dispatch?.shift();
    if (next === undefined) throw new Error('dispatch inesperado');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const getRun = vi.fn<GitHubClient['getRun']>(() => {
    const next = responses.run?.shift();
    if (next === undefined) throw new Error('getRun inesperado');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  return { dispatchWorkflow, getRun };
}

const run = (github: GitHubClient | undefined, h = helpers()) =>
  createReleaseRunTask({ db, github, now: () => NOW })({ tag: '1.2.0' }, asHelpers(h));

describe('release-run', () => {
  it('sem run, dispara o release.yml da main com a versão e grava o run com a próxima consulta', async () => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'gerando', runId: null });
    const github = fakeGitHub({ dispatch: [{ runId: '42', runUrl }] });

    await run(github);

    expect(github.dispatchWorkflow).toHaveBeenCalledWith('release.yml', 'main', {
      version: '1.2.0',
    });
    expect(mocks.recordReleaseRunStarted).toHaveBeenCalledWith(
      db,
      '1.2.0',
      { runId: '42', runUrl },
      new Date(NOW + RELEASE_POLL_MS),
    );
  });

  it('job repetido com o run já gravado não dispara de novo: só consulta', async () => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'gerando', runId: '42' });
    const github = fakeGitHub({ run: [{ status: 'in_progress', conclusion: null, runUrl }] });

    await run(github);

    expect(github.dispatchWorkflow).not.toHaveBeenCalled();
    expect(github.getRun).toHaveBeenCalledWith('42');
    expect(mocks.scheduleReleaseRunCheck).toHaveBeenCalledWith(
      db,
      '1.2.0',
      new Date(NOW + RELEASE_POLL_MS),
    );
    expect(mocks.recordReleaseRunSucceeded).not.toHaveBeenCalled();
    expect(mocks.recordReleaseRunFailed).not.toHaveBeenCalled();
  });

  it('run com sucesso leva a release a baixando', async () => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'gerando', runId: '42' });
    await run(fakeGitHub({ run: [{ status: 'completed', conclusion: 'success', runUrl }] }));

    expect(mocks.recordReleaseRunSucceeded).toHaveBeenCalledWith(db, '1.2.0');
    expect(mocks.scheduleReleaseRunCheck).not.toHaveBeenCalled();
  });

  it.each([
    ['failure', 'O CI do release.yml falhou; veja o run'],
    ['cancelled', 'O run do release.yml foi cancelado'],
    ['timed_out', 'O run do release.yml passou do tempo limite'],
    ['startup_failure', 'O run do release.yml terminou como startup_failure'],
  ])('run %s leva a release a falhou com o motivo', async (conclusion, reason) => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'gerando', runId: '42' });
    await run(fakeGitHub({ run: [{ status: 'completed', conclusion, runUrl }] }));

    expect(mocks.recordReleaseRunFailed).toHaveBeenCalledWith(db, '1.2.0', reason);
    expect(mocks.recordReleaseRunSucceeded).not.toHaveBeenCalled();
  });

  it.each(['descartada', 'baixando', 'disponivel', 'falhou'])(
    'release em %s: termina sem chamar o GitHub nem gravar',
    async (pipelineState) => {
      mocks.loadReleaseRun.mockResolvedValue({ pipelineState, runId: '42' });
      const github = fakeGitHub({});

      await run(github);

      expect(github.dispatchWorkflow).not.toHaveBeenCalled();
      expect(github.getRun).not.toHaveBeenCalled();
      for (const name of [
        'recordReleaseRunStarted',
        'scheduleReleaseRunCheck',
        'recordReleaseRunSucceeded',
        'recordReleaseRunFailed',
      ] as const) {
        expect(mocks[name]).not.toHaveBeenCalled();
      }
    },
  );

  it('release não registrada: só avisa', async () => {
    mocks.loadReleaseRun.mockResolvedValue(undefined);
    const h = helpers();
    await run(fakeGitHub({}), h);

    expect(h.logger.warn).toHaveBeenCalledWith(expect.stringMatching(/não registrada/));
    expect(mocks.recordReleaseRunFailed).not.toHaveBeenCalled();
  });

  it('sem GITHUB_RELEASE_TOKEN, a release falha com motivo legível', async () => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'gerando', runId: null });
    await run(undefined);

    expect(mocks.recordReleaseRunFailed).toHaveBeenCalledWith(db, '1.2.0', MISSING_TOKEN_REASON);
  });

  it('recusa do GitHub (401/403/422) vira falhou com a mensagem do cliente', async () => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'gerando', runId: null });
    const refused = new GitHubError('O GitHub recusou a credencial', {
      transient: false,
      status: 401,
    });
    await run(fakeGitHub({ dispatch: [refused] }));

    expect(mocks.recordReleaseRunFailed).toHaveBeenCalledWith(
      db,
      '1.2.0',
      'O GitHub recusou a credencial',
    );
    expect(mocks.recordReleaseRunStarted).not.toHaveBeenCalled();
  });

  it('rede ou 5xx lança para o Graphile Worker repetir, sem gravar', async () => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'gerando', runId: '42' });
    const down = new GitHubError('GitHub respondeu 502', { transient: true, status: 502 });

    await expect(run(fakeGitHub({ run: [down] }))).rejects.toBe(down);
    expect(mocks.recordReleaseRunFailed).not.toHaveBeenCalled();
    expect(mocks.scheduleReleaseRunCheck).not.toHaveBeenCalled();
  });

  it('na última tentativa, o erro transitório vira falhou em vez de deixar a release gerando', async () => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'gerando', runId: '42' });
    const down = new GitHubError('GitHub respondeu 502', { transient: true, status: 502 });

    await run(fakeGitHub({ run: [down] }), helpers(5, 5));

    expect(mocks.recordReleaseRunFailed).toHaveBeenCalledWith(
      db,
      '1.2.0',
      expect.stringMatching(/não respondeu depois de várias tentativas: GitHub respondeu 502/),
    );
  });

  it('erro que não é do GitHub (banco) lança como veio', async () => {
    mocks.loadReleaseRun.mockResolvedValue({ pipelineState: 'gerando', runId: null });
    mocks.recordReleaseRunStarted.mockRejectedValue(new Error('conexão perdida'));

    await expect(run(fakeGitHub({ dispatch: [{ runId: '42', runUrl }] }))).rejects.toThrow(
      'conexão perdida',
    );
    expect(mocks.recordReleaseRunFailed).not.toHaveBeenCalled();
  });
});
