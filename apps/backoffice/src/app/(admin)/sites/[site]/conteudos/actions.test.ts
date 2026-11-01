import { RESOURCES } from '@orakel/content-model/v1';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentEdit } from '@/domain/content/contents.ts';

import {
  createContentAction,
  submitForReviewAction,
  unpublishContentsAction,
  updateContentAction,
} from './actions.ts';

// As actions só traduzem: sessão → recusa, Result do domínio → issues com path, sucesso →
// revalida a lista. Regras e permissão estão nos testes de contrato do domínio.

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  createContent: vi.fn(),
  updateContent: vi.fn(),
  listContentVersions: vi.fn(),
  submitForReview: vi.fn(),
  unpublishContents: vi.fn(),
  resourcesFor: vi.fn(),
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
  listContentVersions: mocks.listContentVersions,
  submitForReview: mocks.submitForReview,
}));
vi.mock('@/domain/publications/unpublish.ts', () => ({
  unpublishContents: mocks.unpublishContents,
}));
vi.mock('@/domain/sites/sites.ts', () => ({ resourcesFor: mocks.resourcesFor }));

const editor = { email: 'editor@orakel.local', roles: ['editor'] };
const input = { kind: 'article', title: 'Guia', blocks: [] } as unknown as ContentEdit;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ ok: true, value: editor });
  mocks.resourcesFor.mockResolvedValue(RESOURCES);
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
    const saved = { ...input, blocks: [{ n: 1, type: 'toc', title: 'Neste guia' }] };
    mocks.listContentVersions.mockResolvedValue({
      ok: true,
      value: [
        { version: 2, data: input },
        { version: 3, data: saved },
      ],
    });

    expect(await createContentAction('exemplo-a', input)).toEqual({
      ok: true,
      message: 'Conteúdo criado.',
      id: 4,
    });
    expect(await updateContentAction('exemplo-a', 2, input)).toEqual({
      ok: true,
      message: 'Versão 3 salva.',
      id: 2,
      // A versão salva relida do servidor: o editor continua nela (#109).
      saved,
    });
    expect(mocks.listContentVersions).toHaveBeenCalledWith(
      expect.anything(),
      editor,
      'exemplo-a',
      2,
    );
    expect(mocks.createContent).toHaveBeenCalledWith({}, editor, 'exemplo-a', input, {
      resources: RESOURCES,
    });
    expect(mocks.updateContent).toHaveBeenCalledWith({}, editor, 'exemplo-a', 2, input, RESOURCES);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/exemplo-a/conteudos');
  });

  it('valida com os recursos da release do site: sem faq, a gravação com faq é recusada', async () => {
    const withoutFaq = {
      ...RESOURCES,
      blockTypes: RESOURCES.blockTypes.filter((t) => t !== 'faq'),
    };
    mocks.resourcesFor.mockResolvedValue(withoutFaq);
    const unsupported = {
      ok: false,
      issues: [
        {
          code: 'semantic.supported-resources',
          message: 'Bloco faq fora da release',
          path: ['blocks', 0, 'type'],
        },
      ],
    };
    mocks.createContent.mockResolvedValue(unsupported);
    mocks.updateContent.mockResolvedValue(unsupported);

    expect(await createContentAction('exemplo-b', input)).toMatchObject({ ok: false });
    expect(await updateContentAction('exemplo-b', 2, input)).toMatchObject({ ok: false });
    expect(mocks.resourcesFor).toHaveBeenCalledWith({}, 'exemplo-b');
    expect(mocks.createContent).toHaveBeenCalledWith({}, editor, 'exemplo-b', input, {
      resources: withoutFaq,
    });
    expect(mocks.updateContent).toHaveBeenCalledWith({}, editor, 'exemplo-b', 2, input, withoutFaq);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('enviar para revisão', () => {
  it('sem sessão não chama o domínio nem revalida', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await submitForReviewAction('exemplo-a', 1)).toEqual({
      ok: false,
      message: 'Sessão inválida; entre de novo.',
    });
    expect(mocks.submitForReview).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('recusa do domínio volta com a mensagem e não revalida', async () => {
    mocks.submitForReview.mockResolvedValue({
      ok: false,
      issues: [
        {
          code: 'content.not_draft',
          message: 'Só um rascunho vai para revisão: a versão 2 está em_revisao',
          path: [],
        },
      ],
    });

    expect(await submitForReviewAction('exemplo-a', 1)).toEqual({
      ok: false,
      message: 'Só um rascunho vai para revisão: a versão 2 está em_revisao',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('sucesso delega com o ator da sessão e revalida o conteúdo, a lista e a fila', async () => {
    mocks.submitForReview.mockResolvedValue({ ok: true, value: { version: 2 } });

    expect(await submitForReviewAction('exemplo-a', 7)).toEqual({
      ok: true,
      message: 'Enviado para revisão.',
    });
    expect(mocks.submitForReview).toHaveBeenCalledWith({}, editor, 'exemplo-a', 7);
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(1, '/sites/exemplo-a/conteudos');
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(2, '/sites/exemplo-a/conteudos/7');
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(3, '/sites/exemplo-a/revisao');
  });
});

describe('despublicar em massa (#495)', () => {
  it('sem sessão não chama o domínio nem revalida', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await unpublishContentsAction('exemplo-a', [1, 2])).toMatchObject({ ok: false });
    expect(mocks.unpublishContents).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('recusa do lote volta com a mensagem e não revalida', async () => {
    mocks.unpublishContents.mockResolvedValue({
      ok: false,
      issues: [
        {
          code: 'publication.not_live',
          message: 'O conteúdo 2 não está no ar',
          path: ['contentIds', 1],
        },
      ],
    });

    expect(await unpublishContentsAction('exemplo-a', [1, 2])).toEqual({
      ok: false,
      message: 'O conteúdo 2 não está no ar',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('sucesso delega com o ator e os ids, revalida o site e a lista e diz quantos saíram', async () => {
    mocks.unpublishContents.mockResolvedValue({
      ok: true,
      value: {
        unpublished: [
          { contentId: 1, version: 1 },
          { contentId: 2, version: 3 },
        ],
        declaredAt: new Date(),
      },
    });

    expect(await unpublishContentsAction('exemplo-a', [1, 2])).toEqual({
      ok: true,
      message: '2 conteúdos despublicados; a trava fica liberada no próximo build.',
    });
    expect(mocks.unpublishContents).toHaveBeenCalledWith({}, editor, 'exemplo-a', [1, 2]);
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/sites/exemplo-a'],
      ['/sites/exemplo-a/conteudos'],
    ]);
  });
});
