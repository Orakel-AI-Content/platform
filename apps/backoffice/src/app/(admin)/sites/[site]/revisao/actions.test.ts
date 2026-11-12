import { beforeEach, describe, expect, it, vi } from 'vitest';

import { amendAction, approveAction, confirmAction, confirmAllAction } from './actions.ts';

// A action só traduz: sessão → recusa, Result do domínio → resumo do formulário ou mensagem,
// sucesso → revalida a revisão (e, na aprovação, a fila e o conteúdo). Regras e permissão estão
// no contrato do domínio.

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  approveVersion: vi.fn(),
  amendInReview: vi.fn(),
  resourcesFor: vi.fn(),
  setConfirmation: vi.fn(),
  setAllConfirmations: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) } }),
}));
vi.mock('@/domain/content/contents.ts', () => ({ amendInReview: mocks.amendInReview }));
vi.mock('@/domain/sites/sites.ts', () => ({ resourcesFor: mocks.resourcesFor }));
vi.mock('@/domain/reviews/reviews.ts', () => ({ approveVersion: mocks.approveVersion }));
vi.mock('@/domain/reviews/confirmations.ts', () => ({
  setConfirmation: mocks.setConfirmation,
  setAllConfirmations: mocks.setAllConfirmations,
}));

const revisor = { email: 'revisor@orakel.local', roles: ['revisor'] };
const forbidden = {
  ok: false,
  issues: [{ code: 'forbidden', message: 'Sem permissão para content.publish', path: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ ok: true, value: revisor });
  mocks.setConfirmation.mockResolvedValue({ ok: true, value: { confirmed: [] } });
  mocks.resourcesFor.mockResolvedValue({ release: 'r1' });
});

describe('aprovar na tela de revisão', () => {
  it('sem sessão não chama o domínio nem revalida', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await approveAction('exemplo-a', 1, 2)).toEqual({
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

    expect(await approveAction('exemplo-a', 1, 2)).toEqual({
      ok: false,
      message: 'Não foi possível aprovar.',
      issues: [{ path: [], message: 'Marque todos os itens do checklist' }],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('aprova a versão vista sem gravar confirmações e revalida a fila, a revisão e o conteúdo', async () => {
    mocks.approveVersion.mockResolvedValue({ ok: true, value: { reviewId: 9 } });

    expect(await approveAction('exemplo-a', 1, 2)).toEqual({
      ok: true,
      message: 'Versão 2 aprovada.',
    });
    expect(mocks.approveVersion).toHaveBeenCalledWith({}, revisor, 'exemplo-a', 1, 2);
    expect(mocks.setConfirmation).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(1, '/sites/exemplo-a/revisao');
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(2, '/sites/exemplo-a/revisao/1');
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(3, '/sites/exemplo-a/conteudos/1');
  });
});

describe('aprovar e publicar ou agendar na tela de revisão (workspace#89)', () => {
  const outcome = (value: object) => ({
    ok: true,
    value: { reviewId: 9, publicationId: 4, overflowed: false, ...value },
  });
  const overflow =
    'O dia pedido já tinha atingido o limite diário de publicações do site; a publicação foi para o próximo dia com vaga, no mesmo horário.';

  it('sem sessão não chama o domínio nem revalida', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });
    const refused = {
      ok: false,
      message: 'Sessão inválida; entre de novo.',
      issues: [{ path: [], message: 'Sessão inválida; entre de novo.' }],
    };

    expect(await approvePublishAction('exemplo-a', 1, 2)).toEqual(refused);
    expect(await approveScheduleAction('exemplo-a', 1, 2, '2026-11-20T13:00:00.000Z')).toEqual(
      refused,
    );
    expect(mocks.approveAndPublish).not.toHaveBeenCalled();
    expect(mocks.approveAndSchedule).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('publicada na hora: diz que o artigo foi ao ar e revalida a fila, a revisão e o conteúdo', async () => {
    mocks.approveAndPublish.mockResolvedValue(
      outcome({ outcome: 'published', at: new Date('2026-11-12T13:00:00Z') }),
    );

    expect(await approvePublishAction('exemplo-a', 1, 2)).toEqual({
      ok: true,
      message: 'Versão 2 aprovada: o artigo foi ao ar.',
    });
    expect(mocks.approveAndPublish).toHaveBeenCalledWith({}, revisor, 'exemplo-a', 1, 2);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a/revisao');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a/conteudos/1');
  });

  it('agendada: passa o instante ISO ao domínio e diz a data e a hora de São Paulo', async () => {
    mocks.approveAndSchedule.mockResolvedValue(
      outcome({ outcome: 'scheduled', at: new Date('2026-11-20T13:00:00.000Z') }),
    );

    expect(await approveScheduleAction('exemplo-a', 1, 2, '2026-11-20T13:00:00.000Z')).toEqual({
      ok: true,
      message: 'Versão 2 aprovada: o artigo foi agendado para 20/11/2026, 10:00 BRT.',
    });
    expect(mocks.approveAndSchedule).toHaveBeenCalledWith(
      {},
      revisor,
      'exemplo-a',
      1,
      2,
      new Date('2026-11-20T13:00:00.000Z'),
    );
  });

  it('com o dia cheio, publicar na hora vira agendamento na próxima vaga, com o aviso', async () => {
    mocks.approveAndPublish.mockResolvedValue(
      outcome({ outcome: 'scheduled', at: new Date('2026-11-13T13:00:00Z'), overflowed: true }),
    );

    expect(await approvePublishAction('exemplo-a', 1, 2)).toEqual({
      ok: true,
      message: 'Versão 2 aprovada: o artigo foi agendado para 13/11/2026, 10:00 BRT.',
      warning: overflow,
    });
  });

  it('com o dia escolhido cheio, o agendamento vai para a próxima vaga, com o aviso', async () => {
    mocks.approveAndSchedule.mockResolvedValue(
      outcome({ outcome: 'scheduled', at: new Date('2026-11-21T13:00:00Z'), overflowed: true }),
    );

    const result = await approveScheduleAction('exemplo-a', 1, 2, '2026-11-20T13:00:00.000Z');
    expect(result).toMatchObject({ ok: true, warning: overflow });
  });

  it('recusa do domínio volta como resumo do formulário e não revalida', async () => {
    mocks.approveAndPublish.mockResolvedValue({
      ok: false,
      issues: [
        {
          code: 'publication.no_slot',
          message: 'O site exemplo-a não tem vaga de publicação nos próximos 30 dias',
          path: [],
        },
      ],
    });

    expect(await approvePublishAction('exemplo-a', 1, 2)).toEqual({
      ok: false,
      message: 'Não foi possível aprovar.',
      issues: [
        { path: [], message: 'O site exemplo-a não tem vaga de publicação nos próximos 30 dias' },
      ],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
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

describe('corrigir na revisão (#751)', () => {
  const input = { kind: 'artigo', title: 'Título corrigido' } as never;

  it('sem sessão não chama o domínio nem revalida', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await amendAction('exemplo-a', 1, 2, input)).toEqual({
      ok: false,
      message: 'Sessão inválida; entre de novo.',
      issues: [],
    });
    expect(mocks.amendInReview).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('recusa do domínio volta aos campos, como na edição, e não revalida', async () => {
    mocks.amendInReview.mockResolvedValue({
      ok: false,
      issues: [
        {
          code: 'review.not_in_review',
          message: 'A versão 2 não está em revisão',
          path: [],
        },
        { code: 'content.invalid', message: 'Obrigatório', path: ['blocks', 0, 'text'] },
      ],
    });

    expect(await amendAction('exemplo-a', 1, 2, input)).toEqual({
      ok: false,
      message: 'Não foi possível salvar o conteúdo.',
      issues: [
        { path: [], message: 'A versão 2 não está em revisão' },
        { path: ['blocks', 0, 'text'], message: 'Obrigatório' },
      ],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('delega a versão vista com os recursos do site e revalida revisão e conteúdo', async () => {
    mocks.amendInReview.mockResolvedValue({ ok: true, value: { version: 3, created: true } });

    expect(await amendAction('exemplo-a', 1, 2, input)).toEqual({
      ok: true,
      message: 'Correção salva na versão 3.',
      id: 1,
    });
    expect(mocks.amendInReview).toHaveBeenCalledWith({}, revisor, 'exemplo-a', 1, 2, input, {
      release: 'r1',
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/sites/exemplo-a/revisao'],
      ['/sites/exemplo-a/revisao/1'],
      ['/sites/exemplo-a/conteudos/1'],
      ['/sites/exemplo-a/conteudos/1/editar'],
      ['/sites/exemplo-a/conteudos'],
    ]);
  });

  it('sem alteração avisa que nada mudou e não revalida', async () => {
    mocks.amendInReview.mockResolvedValue({ ok: true, value: { version: 2, created: false } });

    expect(await amendAction('exemplo-a', 1, 2, input)).toEqual({
      ok: true,
      message: 'Nenhuma alteração; a versão 2 continua em revisão.',
      id: 1,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
