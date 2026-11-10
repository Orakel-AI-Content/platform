import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recheckReleaseImageAction, registerReleaseAction } from './actions.ts';

// A action só traduz: sessão → recusa, Result do domínio → issues com path, sucesso → revalida
// a lista. Regras e permissão estão no contrato (`releases.contract.test.ts`).

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  registerRelease: vi.fn(),
  requestReleaseImageCheck: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) } }),
}));
vi.mock('@/domain/releases/releases.ts', () => ({
  registerRelease: mocks.registerRelease,
  requestReleaseImageCheck: mocks.requestReleaseImageCheck,
}));

const operacao = { email: 'operacao@orakel.local', roles: ['operacao'] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ ok: true, value: operacao });
});

describe('registerReleaseAction', () => {
  it('sem sessão, recusa sem chamar o domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await registerReleaseAction({ tag: '1.0.0' })).toMatchObject({
      ok: false,
      issues: [],
    });
    expect(mocks.registerRelease).not.toHaveBeenCalled();
  });

  it('registra pelo domínio e revalida a lista', async () => {
    mocks.registerRelease.mockResolvedValue({
      ok: true,
      value: { tag: '1.0.0', registeredAt: new Date() },
    });

    expect(await registerReleaseAction({ tag: '1.0.0' })).toEqual({
      ok: true,
      message: 'Release 1.0.0 registrada.',
    });
    expect(mocks.registerRelease).toHaveBeenCalledWith({}, operacao, '1.0.0');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/releases');
  });

  it('a recusa do domínio volta com o path do campo', async () => {
    mocks.registerRelease.mockResolvedValue({
      ok: false,
      issues: [{ code: 'release.exists', message: 'Já registrada', path: ['tag'] }],
    });

    expect(await registerReleaseAction({ tag: '1.0.0' })).toEqual({
      ok: false,
      message: 'Não foi possível registrar a release.',
      issues: [{ path: ['tag'], message: 'Já registrada' }],
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
