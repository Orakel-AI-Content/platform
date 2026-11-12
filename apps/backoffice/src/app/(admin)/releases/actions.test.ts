import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recheckReleaseImageAction, requestNewReleaseAction } from './actions.ts';

// As actions só traduzem: sessão → recusa, Result do domínio → mensagem, sucesso → revalida
// a lista. Regras e permissão estão no contrato (`releases.contract.test.ts`).

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  requestNewRelease: vi.fn(),
  requestReleaseImageCheck: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) } }),
}));
vi.mock('@/domain/releases/releases.ts', () => ({
  requestNewRelease: mocks.requestNewRelease,
  requestReleaseImageCheck: mocks.requestReleaseImageCheck,
}));

const operacao = { email: 'operacao@orakel.local', roles: ['operacao'] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ ok: true, value: operacao });
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

describe('recheckReleaseImageAction', () => {
  it('sem sessão, recusa sem chamar o domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await recheckReleaseImageAction('1.0.0')).toMatchObject({ ok: false });
    expect(mocks.requestReleaseImageCheck).not.toHaveBeenCalled();
  });

  it('enfileira a conferência pelo domínio e revalida a lista', async () => {
    mocks.requestReleaseImageCheck.mockResolvedValue({ ok: true, value: undefined });

    expect(await recheckReleaseImageAction('1.0.0')).toEqual({
      ok: true,
      message: 'Conferência da imagem 1.0.0 enfileirada; recarregue a lista para ver o resultado.',
    });
    expect(mocks.requestReleaseImageCheck).toHaveBeenCalledWith({}, operacao, '1.0.0');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/releases');
  });

  it('a recusa do domínio (sem release.promote) volta como erro, sem revalidar', async () => {
    mocks.requestReleaseImageCheck.mockResolvedValue({
      ok: false,
      issues: [{ code: 'forbidden', message: 'Sem permissão para release.promote', path: [] }],
    });

    expect(await recheckReleaseImageAction('1.0.0')).toEqual({
      ok: false,
      message: 'Sem permissão para release.promote',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
