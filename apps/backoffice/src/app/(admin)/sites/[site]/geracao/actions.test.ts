import { beforeEach, describe, expect, it, vi } from 'vitest';

import { enqueueGenerationAction } from './actions.ts';

// A action só traduz: sessão → recusa, Result do domínio → issues com path, sucesso → revalida a
// aba. Regras e permissão estão no contrato do domínio (generation.contract).

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  revalidatePath: vi.fn(),
  enqueueGeneration: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn('tx') } }),
}));
vi.mock('@/domain/generation/runs.ts', () => ({ enqueueGeneration: mocks.enqueueGeneration }));

const editor = { email: 'editor@orakel.local', roles: ['editor'] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.currentActor.mockResolvedValue({ ok: true, value: editor });
});

describe('enqueueGenerationAction', () => {
  it('delega ao domínio na transação e revalida a aba', async () => {
    mocks.enqueueGeneration.mockResolvedValue({ ok: true, value: { runId: 7 } });

    const result = await enqueueGenerationAction('exemplo-a', { topic: 'Café', authorId: 3 });

    expect(mocks.enqueueGeneration).toHaveBeenCalledWith('tx', editor, 'exemplo-a', {
      topic: 'Café',
      authorId: 3,
    });
    expect(result).toMatchObject({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a/geracao');
  });

  it('recusa do domínio volta como issues do campo, sem revalidar', async () => {
    mocks.enqueueGeneration.mockResolvedValue({
      ok: false,
      issues: [{ code: 'author.not_found', message: 'Autor 9 não encontrado', path: ['authorId'] }],
    });

    const result = await enqueueGenerationAction('exemplo-a', { topic: 'Café', authorId: 9 });

    expect(result).toEqual({
      ok: false,
      message: 'Não foi possível disparar a geração.',
      issues: [{ path: ['authorId'], message: 'Autor 9 não encontrado' }],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('sem sessão, recusa sem chamar o domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    const result = await enqueueGenerationAction('exemplo-a', {});

    expect(result).toMatchObject({ ok: false, message: 'Sessão inválida; entre de novo.' });
    expect(mocks.enqueueGeneration).not.toHaveBeenCalled();
  });
});
