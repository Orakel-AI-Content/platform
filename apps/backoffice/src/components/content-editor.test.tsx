// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FieldValues } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContentEdit } from '@/domain/content/contents.ts';

import type { ContentFormResult } from './content-editor-values.ts';
import { ContentEditor, type ContentEditorOptions } from './content-editor.tsx';

// Editor de conteúdo (#45): tipos da release, seletores do site, teclado e erros por campo.

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const options: ContentEditorOptions = {
  blockTypes: ['text', 'toc', 'quote', 'image', 'faq'],
  media: [{ id: 1, label: 'Mídia 1 (1200×800)' }],
  authors: [
    { id: 1, label: 'Ana' },
    { id: 2, label: 'Bia' },
  ],
  taxonomies: [{ id: 1, label: 'Receitas (categoria)' }],
};

const meta = {
  kind: 'article',
  slug: 'guia',
  title: 'Guia',
  authorIds: [],
  taxonomyIds: [],
  publishedAt: '2026-10-06T12:00:00-03:00',
};

const toc = (n: number, title: string) => ({ n, type: 'toc', title });

type RenderProps = {
  defaultValues?: FieldValues;
  blockTypes?: readonly string[];
  result?: ContentFormResult;
  mode?: 'create' | 'edit';
};

function renderEditor({
  defaultValues = { ...meta, blocks: [toc(1, 'A'), toc(2, 'B'), toc(3, 'C')] },
  blockTypes = options.blockTypes,
  result = { ok: true, message: 'ok', id: 7 },
  mode = 'edit',
}: RenderProps = {}) {
  const action = vi.fn<(input: ContentEdit) => Promise<ContentFormResult>>(() =>
    Promise.resolve(result),
  );
  render(
    <ContentEditor
      mode={mode}
      siteId="exemplo-a"
      defaultValues={defaultValues}
      options={{ ...options, blockTypes }}
      action={action}
    />,
  );
  return action;
}

const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /Salvar nova versão|Criar conteúdo/ }));

describe('editor de conteúdo', () => {
  it('o tipo de bloco novo só oferece os tipos da release', () => {
    renderEditor({ blockTypes: ['text', 'toc', 'image'] });

    const select = screen.getByLabelText('Tipo do novo bloco');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Texto', 'Sumário', 'Imagem']);
  });

  it('autores e taxonomias do site aparecem para seleção', () => {
    renderEditor();

    const authors = screen.getByRole('group', { name: 'Autores' });
    expect(
      within(authors)
        .getAllByRole('checkbox')
        .map((c) => c.closest('label')?.textContent),
    ).toEqual(['Ana', 'Bia']);
    const taxonomies = screen.getByRole('group', { name: 'Taxonomias' });
    expect(within(taxonomies).getByRole('checkbox', { name: 'Receitas (categoria)' })).toBeTruthy();
  });

  it('move e remove blocos só pelo teclado; os n existentes seguem para o servidor', async () => {
    const user = userEvent.setup();
    const action = renderEditor();

    screen.getByRole('button', { name: 'Mover bloco 2 para cima' }).focus();
    await user.keyboard('{Enter}');
    screen.getByRole('button', { name: 'Remover bloco 3' }).focus();
    await user.keyboard('{Enter}');
    await save(user);

    await waitFor(() => expect(action).toHaveBeenCalled());
    const input = action.mock.calls[0]?.[0];
    expect(input?.blocks.map((block) => [block.n, 'title' in block ? block.title : ''])).toEqual([
      [2, 'B'],
      [1, 'A'],
    ]);
    expect(router.push).toHaveBeenCalledWith('/sites/exemplo-a/conteudos/7');
  });

  it('bloco adicionado vai como novo, sem n', async () => {
    const user = userEvent.setup();
    const action = renderEditor({ mode: 'create', defaultValues: { ...meta, blocks: [] } });

    await user.selectOptions(screen.getByLabelText('Tipo do novo bloco'), 'Sumário');
    await user.click(screen.getByRole('button', { name: 'Adicionar bloco' }));
    await user.type(screen.getByLabelText('Título do sumário'), 'Neste guia');
    await save(user);

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0]?.[0].blocks).toEqual([
      { new: true, type: 'toc', title: 'Neste guia' },
    ]);
    expect(router.push).toHaveBeenCalledWith('/sites/exemplo-a/conteudos');
  });

  it('imagem sem texto alternativo e sem decorativa é recusada junto do campo', async () => {
    const user = userEvent.setup();
    const action = renderEditor({
      defaultValues: { ...meta, blocks: [{ n: 1, type: 'image', mediaId: 1 }] },
    });

    await save(user);

    const alt = await screen.findByLabelText('Texto alternativo');
    await waitFor(() => expect(alt.getAttribute('aria-invalid')).toBe('true'));
    const describedBy = alt.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy.split(' ').at(-1) ?? '')?.textContent).toBe(
      'Informe o texto alternativo ou marque a imagem como decorativa',
    );
    expect(action).not.toHaveBeenCalled();
  });

  it('a recusa do domínio aparece no campo do caminho e no resumo', async () => {
    const user = userEvent.setup();
    renderEditor({
      result: {
        ok: false,
        message: 'Não foi possível salvar o conteúdo.',
        issues: [
          { path: ['blocks', 0, 'title'], message: 'Título recusado' },
          { path: [], message: 'Sem permissão para content.write' },
        ],
      },
    });

    await save(user);

    expect(await screen.findByText('Título recusado')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Sem permissão para content.write');
    expect(router.push).not.toHaveBeenCalled();
  });
});
