import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  discardReleaseAction,
  releasesStatusAction,
  requestNewReleaseAction,
  retryReleaseAction,
  startRolloutAction,
} from './actions.ts';

// As actions só traduzem: sessão → recusa, Result do domínio → mensagem, sucesso → revalida
// a lista. Regras e permissão estão no contrato (`releases.contract.test.ts`).

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  requestNewRelease: vi.fn(),
  retryRelease: vi.fn(),
  discardRelease: vi.fn(),
  startRollout: vi.fn(),
  loadReleasesSnapshot: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) } }),
}));
vi.mock('@/domain/releases/releases.ts', () => ({
  requestNewRelease: mocks.requestNewRelease,
  retryRelease: mocks.retryRelease,
  discardRelease: mocks.discardRelease,
}));
vi.mock('@/domain/releases/rollout.ts', () => ({ startRollout: mocks.startRollout }));
vi.mock('./snapshot.ts', () => ({ loadReleasesSnapshot: mocks.loadReleasesSnapshot }));

const operacao = { email: 'operacao@orakel.local', roles: ['operacao'] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ ok: true, value: operacao });
});

describe('startRolloutAction', () => {
  it('sem sessão, recusa sem chamar o domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await startRolloutAction()).toMatchObject({ ok: false });
    expect(mocks.startRollout).not.toHaveBeenCalled();
  });

  it('inicia pelo domínio, anuncia a versão devolvida e revalida a lista', async () => {
    mocks.startRollout.mockResolvedValue({ ok: true, value: { targetRelease: '1.5.0' } });

    expect(await startRolloutAction()).toEqual({
      ok: true,
      message: 'Atualização para 1.5.0 iniciada pelo primeiro site.',
    });
    expect(mocks.startRollout).toHaveBeenCalledWith({}, operacao);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/releases');
  });

  it('a recusa do domínio volta com a mensagem dele, sem revalidar', async () => {
    mocks.startRollout.mockResolvedValue({
      ok: false,
      issues: [
        {
          code: 'rollout.already_open',
          message: 'Já existe uma atualização de todos os sites em andamento',
          path: [],
        },
      ],
    });

    expect(await startRolloutAction()).toEqual({
      ok: false,
      message: 'Já existe uma atualização de todos os sites em andamento',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('requestNewReleaseAction', () => {
  it('sem sessão, recusa sem chamar o domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await requestNewReleaseAction('patch')).toMatchObject({ ok: false });
    expect(mocks.requestNewRelease).not.toHaveBeenCalled();
  });

  it('pede pelo domínio, anuncia a tag devolvida e revalida a lista', async () => {
    mocks.requestNewRelease.mockResolvedValue({
      ok: true,
      value: { tag: '1.3.0', pipelineState: 'gerando' },
    });

    expect(await requestNewReleaseAction('minor')).toEqual({
      ok: true,
      message: 'Versão 1.3.0 pedida; a geração começou.',
    });
    expect(mocks.requestNewRelease).toHaveBeenCalledWith({}, operacao, 'minor');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/releases');
  });

  it('a recusa do domínio volta como erro, sem revalidar', async () => {
    mocks.requestNewRelease.mockResolvedValue({
      ok: false,
      issues: [{ code: 'release.version_taken', message: 'Peça de novo', path: ['bump'] }],
    });

    expect(await requestNewReleaseAction('patch')).toEqual({
      ok: false,
      message: 'Peça de novo',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

// "Tentar de novo" e "Descartar" traduzem do mesmo jeito: sessão, recusa do domínio e sucesso.
describe.each([
  {
    name: 'retryReleaseAction',
    action: retryReleaseAction,
    domain: () => mocks.retryRelease,
    refusal: { code: 'release.not_failed', message: 'A release 1.0.0 não falhou' },
    success: 'Versão 1.0.0: a geração recomeçou.',
  },
  {
    name: 'discardReleaseAction',
    action: discardReleaseAction,
    domain: () => mocks.discardRelease,
    refusal: {
      code: 'release.in_use',
      message:
        'A release 1.0.0 está em uso por blog-a; troque a versão desses sites antes de descartar',
    },
    success: 'Versão 1.0.0 descartada.',
  },
])('$name', ({ action, domain, refusal, success }) => {
  it('sem sessão, recusa sem chamar o domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await action('1.0.0')).toMatchObject({ ok: false });
    expect(domain()).not.toHaveBeenCalled();
  });

  it('chama o domínio com a tag e revalida a lista', async () => {
    domain().mockResolvedValue({ ok: true, value: { tag: '1.0.0' } });

    expect(await action('1.0.0')).toEqual({ ok: true, message: success });
    expect(domain()).toHaveBeenCalledWith({}, operacao, '1.0.0');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/releases');
  });

  it('a recusa do domínio volta como erro, sem revalidar', async () => {
    domain().mockResolvedValue({ ok: false, issues: [{ ...refusal, path: ['tag'] }] });

    expect(await action('1.0.0')).toEqual({ ok: false, message: refusal.message });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('releasesStatusAction', () => {
  it('sem sessão, não lê nada', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await releasesStatusAction()).toBeUndefined();
    expect(mocks.loadReleasesSnapshot).not.toHaveBeenCalled();
  });

  it('devolve as releases e as tags em uso, sem revalidar', async () => {
    const snapshot = { rows: [{ tag: '1.0.0', pipelineState: 'gerando' }], inUse: ['0.9.0'] };
    mocks.loadReleasesSnapshot.mockResolvedValue({ ok: true, value: snapshot });

    expect(await releasesStatusAction()).toEqual(snapshot);
    expect(mocks.loadReleasesSnapshot).toHaveBeenCalledWith(expect.anything(), operacao);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('a recusa de permissão vira `undefined`', async () => {
    mocks.loadReleasesSnapshot.mockResolvedValue({
      ok: false,
      issues: [{ code: 'forbidden', message: 'Sem permissão para release.promote', path: [] }],
    });

    expect(await releasesStatusAction()).toBeUndefined();
  });
});
