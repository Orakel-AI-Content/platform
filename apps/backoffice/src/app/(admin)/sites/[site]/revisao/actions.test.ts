import { beforeEach, describe, expect, it, vi } from 'vitest';

import { approveAction } from './actions.ts';

// A action só traduz: sessão → recusa, Result do domínio → resumo do formulário, sucesso →
// revalida a fila, a revisão e o conteúdo. Regras e permissão estão no contrato do domínio.

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  approveVersion: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) } }),
}));
vi.mock('@/domain/reviews/reviews.ts', () => ({ approveVersion: mocks.approveVersion }));

const revisor = { email: 'revisor@orakel.local', roles: ['revisor'] };
const checklist = ['valor_original', 'descricao_imagens'];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ ok: true, value: revisor });
});

describe('aprovar na tela de revisão', () => {
  it('sem sessão não chama o domínio nem revalida', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await approveAction('exemplo-a', 1, 2, checklist)).toEqual({
      ok: false,
      issues: [{ path: [], message: 'Sessão inválida; entre de novo.' }],
    });
    expect(mocks.approveVersion).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('recusa do domínio volta como resumo do formulário e não revalida', async () => {
    mocks.approveVersion.mockResolvedValue({
      ok: false,
      issues: [
        {
          code: 'review.checklist_incomplete',
          message: 'Marque todos os itens do checklist',
          path: ['checklist'],
        },
      ],
    });

    expect(await approveAction('exemplo-a', 1, 2, checklist)).toEqual({
      ok: false,
      issues: [{ path: [], message: 'Marque todos os itens do checklist' }],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('sucesso delega com a versão vista e revalida a fila, a revisão e o conteúdo', async () => {
    mocks.approveVersion.mockResolvedValue({ ok: true, value: { reviewId: 9 } });

    expect(await approveAction('exemplo-a', 1, 2, checklist)).toEqual({
      ok: true,
      message: 'Versão 2 aprovada.',
    });
    expect(mocks.approveVersion).toHaveBeenCalledWith({}, revisor, 'exemplo-a', 1, 2, checklist);
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(1, '/sites/exemplo-a/revisao');
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(2, '/sites/exemplo-a/revisao/1');
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(3, '/sites/exemplo-a/conteudos/1');
  });
});
