import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentEdit } from '@/domain/content/contents.ts';

import { createContentAction, updateContentAction } from './actions.ts';

// As actions só traduzem: sessão → recusa, Result do domínio → issues com path, sucesso →
// revalida a lista. Regras e permissão estão nos testes de contrato do domínio.

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  createContent: vi.fn(),
  updateContent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) } }),
}));
vi.mock('@/domain/content/contents.ts', () => ({
  createContent: mocks.createContent,
  updateContent: mocks.updateContent,
}));

const editor = { email: 'editor@orakel.local', roles: ['editor'] };
const input = { kind: 'article', title: 'Guia', blocks: [] } as unknown as ContentEdit;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ ok: true, value: editor });
});

describe('ações do editor de conteúdo', () => {
  it('sem sessão não chama o domínio nem revalida', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await createContentAction('exemplo-a', input)).toMatchObject({ ok: false });
    expect(await updateContentAction('exemplo-a', 1, input)).toMatchObject({ ok: false });
    expect(mocks.createContent).not.toHaveBeenCalled();
    expect(mocks.updateContent).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('recusa do domínio (forbidden) volta com as issues e não revalida', async () => {
    const forbidden = {
      ok: false,
      issues: [{ code: 'forbidden', message: 'Sem permissão', path: [] }],
    };
    mocks.createContent.mockResolvedValue(forbidden);
    mocks.updateContent.mockResolvedValue({
      ok: false,
      issues: [{ code: 'custom', message: 'Informe o alt', path: ['blocks', 0, 'alt'] }],
    });

    expect(await createContentAction('exemplo-a', input)).toEqual({
      ok: false,
      message: 'Não foi possível salvar o conteúdo.',
      issues: [{ path: [], message: 'Sem permissão' }],
    });
    expect(await updateContentAction('exemplo-a', 1, input)).toMatchObject({
      issues: [{ path: ['blocks', 0, 'alt'], message: 'Informe o alt' }],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('sucesso delega com o ator da sessão e revalida a lista do site', async () => {
    mocks.createContent.mockResolvedValue({ ok: true, value: { id: 4 } });
    mocks.updateContent.mockResolvedValue({ ok: true, value: { version: 3 } });

    expect(await createContentAction('exemplo-a', input)).toEqual({
      ok: true,
      message: 'Conteúdo criado.',
      id: 4,
    });
    expect(await updateContentAction('exemplo-a', 2, input)).toEqual({
      ok: true,
      message: 'Versão 3 salva.',
      id: 2,
    });
    expect(mocks.createContent).toHaveBeenCalledWith({}, editor, 'exemplo-a', input);
    expect(mocks.updateContent).toHaveBeenCalledWith({}, editor, 'exemplo-a', 2, input);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a/conteudos');
  });
});
