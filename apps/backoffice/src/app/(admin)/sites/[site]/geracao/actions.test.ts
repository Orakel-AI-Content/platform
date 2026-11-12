import { beforeEach, describe, expect, it, vi } from 'vitest';

import { enqueueGenerationAction, generationRunsAction } from './actions.ts';

// A action só traduz: sessão → recusa, Result do domínio → issues com path, sucesso → revalida a
// aba. Regras e permissão estão no contrato do domínio (generation.contract).

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  revalidatePath: vi.fn(),
  enqueueGeneration: vi.fn(),
  listGenerationRuns: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn('tx') } }),
}));
vi.mock('@/domain/generation/runs.ts', () => ({
  enqueueGeneration: mocks.enqueueGeneration,
  listGenerationRuns: mocks.listGenerationRuns,
}));

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

describe('generationRunsAction', () => {
  const runs = [{ id: 7, status: 'ok', contentId: 42 }];

  it('devolve as execuções do site pelo domínio', async () => {
    mocks.listGenerationRuns.mockResolvedValue({ ok: true, value: runs });

    const result = await generationRunsAction('exemplo-a');

    expect(mocks.listGenerationRuns).toHaveBeenCalledWith(expect.anything(), editor, 'exemplo-a');
    expect(result).toBe(runs);
  });

  it('sem permissão, null', async () => {
    mocks.listGenerationRuns.mockResolvedValue({
      ok: false,
      issues: [{ code: 'forbidden', message: 'Sem permissão', path: [] }],
    });

    expect(await generationRunsAction('exemplo-a')).toBeNull();
  });

  it('sem sessão, null sem chamar o domínio', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await generationRunsAction('exemplo-a')).toBeNull();
    expect(mocks.listGenerationRuns).not.toHaveBeenCalled();
  });
});
