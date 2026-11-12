import { beforeEach, describe, expect, it, vi } from 'vitest';

import { approveAction, confirmAction, confirmAllAction } from './actions.ts';

// A action só traduz: sessão → recusa, Result do domínio → resumo do formulário ou mensagem,
// sucesso → revalida a revisão (e, na aprovação, a fila e o conteúdo). Regras e permissão estão
// no contrato do domínio.

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  approveVersion: vi.fn(),
  setConfirmation: vi.fn(),
  setAllConfirmations: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) } }),
}));
vi.mock('@/domain/reviews/reviews.ts', () => ({ approveVersion: mocks.approveVersion }));
vi.mock('@/domain/reviews/confirmations.ts', () => ({
  setConfirmation: mocks.setConfirmation,
  setAllConfirmations: mocks.setAllConfirmations,
}));

const revisor = { email: 'revisor@orakel.local', roles: ['revisor'] };
const checklist = ['valor_original', 'visualizacao_conferida'];
const forbidden = {
  ok: false,
  issues: [{ code: 'forbidden', message: 'Sem permissão para content.publish', path: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ ok: true, value: revisor });
  mocks.setConfirmation.mockResolvedValue({ ok: true, value: { confirmed: [] } });
});

describe('aprovar na tela de revisão', () => {
  it('sem sessão não chama o domínio nem revalida', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await approveAction('exemplo-a', 1, 2, checklist)).toEqual({
      ok: false,
      message: 'Sessão inválida; entre de novo.',
      issues: [{ path: [], message: 'Sessão inválida; entre de novo.' }],
    });
    expect(mocks.setConfirmation).not.toHaveBeenCalled();
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
      message: 'Não foi possível aprovar.',
      issues: [{ path: [], message: 'Marque todos os itens do checklist' }],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('recusa ao gravar uma chave não aprova', async () => {
    mocks.setConfirmation.mockResolvedValue(forbidden);

    expect(await approveAction('exemplo-a', 1, 2, checklist)).toMatchObject({
      ok: false,
      message: 'Não foi possível aprovar.',
      issues: [{ path: [], message: 'Sem permissão para content.publish' }],
    });
    expect(mocks.setConfirmation).toHaveBeenCalledTimes(1);
    expect(mocks.approveVersion).not.toHaveBeenCalled();
  });

  it('grava as chaves recebidas, aprova a versão vista e revalida a fila, a revisão e o conteúdo', async () => {
    mocks.approveVersion.mockResolvedValue({ ok: true, value: { reviewId: 9 } });

    expect(await approveAction('exemplo-a', 1, 2, checklist)).toEqual({
      ok: true,
      message: 'Versão 2 aprovada.',
    });
    expect(mocks.setConfirmation.mock.calls).toEqual(
      checklist.map((key) => [{}, revisor, 'exemplo-a', 1, 2, key, true]),
    );
    expect(mocks.approveVersion).toHaveBeenCalledWith({}, revisor, 'exemplo-a', 1, 2);
    expect(mocks.setConfirmation.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.approveVersion.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(1, '/sites/exemplo-a/revisao');
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(2, '/sites/exemplo-a/revisao/1');
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(3, '/sites/exemplo-a/conteudos/1');
  });
});

describe('marcar e desmarcar as confirmações na tela de revisão', () => {
  it('sem sessão não chama o domínio nem revalida', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });
    const refused = { ok: false, message: 'Sessão inválida; entre de novo.' };

    expect(await confirmAction('exemplo-a', 1, 2, 'valor_original', true)).toEqual(refused);
    expect(await confirmAllAction('exemplo-a', 1, 2, true)).toEqual(refused);
    expect(mocks.setConfirmation).not.toHaveBeenCalled();
    expect(mocks.setAllConfirmations).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('recusa do domínio volta como mensagem e não revalida', async () => {
    mocks.setConfirmation.mockResolvedValue(forbidden);
    mocks.setAllConfirmations.mockResolvedValue(forbidden);
    const refused = { ok: false, message: 'Sem permissão para content.publish' };

    expect(await confirmAction('exemplo-a', 1, 2, 'valor_original', false)).toEqual(refused);
    expect(await confirmAllAction('exemplo-a', 1, 2, false)).toEqual(refused);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('sucesso delega com a versão vista, devolve as chaves gravadas e revalida a revisão', async () => {
    mocks.setConfirmation.mockResolvedValue({ ok: true, value: { confirmed: ['valor_original'] } });
    mocks.setAllConfirmations.mockResolvedValue({ ok: true, value: { confirmed: [] } });

    expect(await confirmAction('exemplo-a', 1, 2, 'valor_original', true)).toEqual({
      ok: true,
      confirmed: ['valor_original'],
    });
    expect(mocks.setConfirmation).toHaveBeenCalledWith(
      {},
      revisor,
      'exemplo-a',
      1,
      2,
      'valor_original',
      true,
    );
    expect(await confirmAllAction('exemplo-a', 1, 2, false)).toEqual({ ok: true, confirmed: [] });
    expect(mocks.setAllConfirmations).toHaveBeenCalledWith({}, revisor, 'exemplo-a', 1, 2, false);
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/sites/exemplo-a/revisao/1'],
      ['/sites/exemplo-a/revisao/1'],
    ]);
  });
});
