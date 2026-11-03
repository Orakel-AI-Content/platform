import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerReleaseAction } from './actions.ts';

// A action só traduz: sessão → recusa, Result do domínio → issues com path, sucesso → revalida
// a lista. Regras e permissão estão no contrato (`releases.contract.test.ts`).

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  registerRelease: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) } }),
}));
vi.mock('@/domain/releases/releases.ts', () => ({ registerRelease: mocks.registerRelease }));

const operacao = { email: 'operacao@orakel.local', roles: ['operacao'] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ ok: true, value: operacao });
});

describe('registerReleaseAction', () => {
  it('sem sessão, recusa sem chamar o domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await registerReleaseAction({ tag: 'core-v1.0.0' })).toMatchObject({
      ok: false,
      issues: [],
    });
    expect(mocks.registerRelease).not.toHaveBeenCalled();
  });

  it('registra pelo domínio e revalida a lista', async () => {
    mocks.registerRelease.mockResolvedValue({
      ok: true,
      value: { tag: 'core-v1.0.0', registeredAt: new Date() },
    });

    expect(await registerReleaseAction({ tag: 'core-v1.0.0' })).toEqual({
      ok: true,
      message: 'Release core-v1.0.0 registrada.',
    });
    expect(mocks.registerRelease).toHaveBeenCalledWith({}, operacao, 'core-v1.0.0');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/releases');
  });

  it('a recusa do domínio volta com o path do campo', async () => {
    mocks.registerRelease.mockResolvedValue({
      ok: false,
      issues: [{ code: 'release.exists', message: 'Já registrada', path: ['tag'] }],
    });

    expect(await registerReleaseAction({ tag: 'core-v1.0.0' })).toEqual({
      ok: false,
      message: 'Não foi possível registrar a release.',
      issues: [{ path: ['tag'], message: 'Já registrada' }],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
