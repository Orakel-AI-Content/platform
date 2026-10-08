// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FieldValues } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContentEdit } from '@/domain/content/contents.ts';

import type { ContentFormResult } from './content-editor-values.ts';
import { ContentEditor, type ContentEditorOptions } from './content-editor.tsx';

// Editor de conteúdo (#45): tipos da release, seletores do site, teclado e erros por campo.

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/sites/exemplo-a/conteudos/7/editar',
}));

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
  created?: boolean;
  previewUrl?: string;
  respond?: (input: ContentEdit) => Promise<ContentFormResult>;
};

function renderEditor({
  defaultValues = { ...meta, blocks: [toc(1, 'A'), toc(2, 'B'), toc(3, 'C')] },
  blockTypes = options.blockTypes,
  result = { ok: true, message: 'Versão 2 salva.', id: 7 },
  mode = 'edit',
  created,
  previewUrl,
  respond = () => Promise.resolve(result),
}: RenderProps = {}) {
  const action = vi.fn<(input: ContentEdit) => Promise<ContentFormResult>>(respond);
  render(
    <ContentEditor
      mode={mode}
      siteId="exemplo-a"
      defaultValues={defaultValues}
      options={{ ...options, blockTypes }}
      action={action}
      created={created}
      previewUrl={previewUrl}
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
    // Fica no editor (#109): confirmação na barra e o cabeçalho atualizado, sem navegar.
    expect(await screen.findByText('Versão 2 salva.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Versão 2 salva.');
    expect(router.refresh).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
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
    // Criou: vai para a edição do conteúdo criado, que anuncia a confirmação (#109).
    expect(router.replace).toHaveBeenCalledWith('/sites/exemplo-a/conteudos/7/editar?criado=1');
    expect(router.push).not.toHaveBeenCalled();
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
    expect(screen.getByRole('status').textContent).toBe('');
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('barra de ações e continuar no editor (#109)', () => {
  it('o botão e o resultado ficam numa barra fixa no rodapé', () => {
    renderEditor();

    const bar = screen.getByRole('button', { name: 'Salvar nova versão' }).parentElement;
    expect(bar?.className).toContain('sticky');
    expect(bar?.className).toContain('bottom-0');
    expect(bar?.querySelector('[role="status"]')).toBeTruthy();
    expect(bar?.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('durante o salvamento, "Salvando…" e nenhum outro clique', async () => {
    const user = userEvent.setup();
    let finish: (result: ContentFormResult) => void = () => {};
    const action = renderEditor({
      respond: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });

    await save(user);
    const button = await screen.findByRole('button', { name: 'Salvando…' });
    expect(button).toHaveProperty('disabled', true);
    await user.click(button);
    expect(action).toHaveBeenCalledTimes(1);

    act(() => finish({ ok: true, message: 'Versão 2 salva.', id: 7 }));
    expect(await screen.findByRole('button', { name: 'Salvar nova versão' })).toBeTruthy();
  });

  it('recomeça da versão salva: o bloco novo ganha o n do servidor e salvar de novo não duplica', async () => {
    const user = userEvent.setup();
    const saved = { ...meta, blocks: [toc(1, 'A'), toc(4, 'Novo')] };
    const action = renderEditor({
      defaultValues: { ...meta, blocks: [toc(1, 'A')] },
      result: { ok: true, message: 'Versão 2 salva.', id: 7, saved: saved as never },
    });

    await user.selectOptions(screen.getByLabelText('Tipo do novo bloco'), 'Sumário');
    await user.click(screen.getByRole('button', { name: 'Adicionar bloco' }));
    const titles = screen.getAllByLabelText('Título do sumário');
    await user.type(titles[titles.length - 1] as HTMLElement, 'Novo');
    await save(user);
    expect(await screen.findByText('Versão 2 salva.')).toBeTruthy();
    expect(action.mock.calls[0]?.[0].blocks.at(-1)).toMatchObject({ new: true, title: 'Novo' });
    // A confirmação chega antes do fim da transição: espera o botão sair de "Salvando…".
    const button = await screen.findByRole('button', { name: 'Salvar nova versão' });
    expect(button).toHaveProperty('disabled', false);

    await save(user);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action.mock.calls[1]?.[0].blocks).toEqual([toc(1, 'A'), toc(4, 'Novo')]);
  });

  it('acabou de criar: anuncia "Conteúdo criado." e tira a marca da URL', async () => {
    renderEditor({ created: true });

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Conteúdo criado.'));
    expect(router.replace).toHaveBeenCalledWith('/sites/exemplo-a/conteudos/7/editar', {
      scroll: false,
    });
  });
});

describe('ver prévia (#110)', () => {
  const PREVIEW = 'https://preview.orakel.localhost/exemplo-a/guia/';
  const note = (id: string | null) => document.getElementById(id ?? '');

  it('salvo: abre a prévia da última versão em nova aba, sem aviso', () => {
    renderEditor({ previewUrl: PREVIEW });

    const link = screen.getByRole('link', { name: 'Ver prévia (abre em nova aba)' });
    expect(link.getAttribute('href')).toBe(PREVIEW);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(note(link.getAttribute('aria-describedby'))?.textContent).toBe('');
  });

  it('alterado: o aviso aparece numa região anunciada e some depois de salvar', async () => {
    const user = userEvent.setup();
    renderEditor({
      previewUrl: PREVIEW,
      defaultValues: { ...meta, blocks: [toc(1, 'A')] },
      result: {
        ok: true,
        message: 'Versão 2 salva.',
        id: 7,
        saved: { ...meta, title: 'Guia revisado', blocks: [toc(1, 'A')] } as never,
      },
    });
    const link = screen.getByRole('link', { name: 'Ver prévia (abre em nova aba)' });
    const region = note(link.getAttribute('aria-describedby'));
    expect(region?.getAttribute('aria-live')).toBe('polite');

    await user.type(screen.getByLabelText('Título', { exact: true }), ' revisado');
    await waitFor(() =>
      expect(region?.textContent).toBe('As alterações não salvas não aparecem na prévia.'),
    );

    await save(user);
    await screen.findByText('Versão 2 salva.');
    await waitFor(() => expect(region?.textContent).toBe(''));
  });

  it('novo: antes do primeiro salvamento, "Ver prévia" não é um link ativo', () => {
    renderEditor({ mode: 'create', defaultValues: { ...meta, blocks: [] } });

    expect(screen.queryByRole('link', { name: /Ver prévia/ })).toBeNull();
    const button = screen.getByRole('button', { name: 'Ver prévia' });
    expect(button).toHaveProperty('disabled', true);
    expect(note(button.getAttribute('aria-describedby'))?.textContent).toBe(
      'Salve para ver a prévia.',
    );
  });
});

describe('aviso ao sair (#111)', () => {
  const confirm = vi.fn<(message?: string) => boolean>(() => false);
  const leave = () => {
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    return unload.defaultPrevented;
  };

  it('liga com alterações, desliga ao desfazer à mão e depois de salvar', async () => {
    window.confirm = confirm;
    const user = userEvent.setup();
    renderEditor({
      defaultValues: { ...meta, blocks: [toc(1, 'A')] },
      result: {
        ok: true,
        message: 'Versão 2 salva.',
        id: 7,
        saved: { ...meta, title: 'Guia!', blocks: [toc(1, 'A')] } as never,
      },
    });
    const title = screen.getByLabelText('Título', { exact: true });
    expect(leave()).toBe(false);

    await user.type(title, '!');
    await waitFor(() => expect(leave()).toBe(true));
    await user.type(title, '{Backspace}');
    await waitFor(() => expect(leave()).toBe(false));

    await user.type(title, '!');
    await save(user);
    await screen.findByText('Versão 2 salva.');
    await waitFor(() => expect(leave()).toBe(false));
  });
});
