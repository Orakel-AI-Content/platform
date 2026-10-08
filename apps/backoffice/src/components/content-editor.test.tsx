// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FieldValues } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContentEdit } from '@/domain/content/contents.ts';

import type { ContentFormResult } from './content-editor-values.ts';
import { ContentEditor, UNDO_MS, type ContentEditorOptions } from './content-editor.tsx';

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

const photo = (id: number) => ({
  id,
  width: 1200,
  height: 800,
  sources: [],
  src: `https://media.exemplo-a.test/${id}.webp`,
});

const options: ContentEditorOptions = {
  blockTypes: ['text', 'toc', 'quote', 'image', 'faq'],
  media: {
    load: (page) => Promise.resolve({ items: [photo(1)], total: 1, page, pageSize: 24 }),
    byIds: (ids) => Promise.resolve(ids.includes(1) ? [photo(1)] : []),
  },
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
      timeZone="America/Sao_Paulo"
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
    // O foco fica no botão acionado, agora do bloco 1 (#131).
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Mover bloco 1 para cima' }),
    );
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

describe('desfazer a remoção de bloco (#112)', () => {
  const three = { ...meta, blocks: [toc(1, 'A'), toc(2, 'B'), toc(3, 'C')] };
  const status = () => screen.getByRole('status').textContent;
  const titles = () =>
    screen.getAllByLabelText<HTMLInputElement>('Título do sumário').map((input) => input.value);
  const remove = (user: ReturnType<typeof userEvent.setup>, position: number) =>
    user.click(screen.getByRole('button', { name: `Remover bloco ${position}` }));

  afterEach(() => {
    vi.useRealTimers();
  });

  it('remover mostra "Bloco N removido." em role="status", com o botão Desfazer', async () => {
    const user = userEvent.setup();
    renderEditor({ defaultValues: three });

    await remove(user, 2);

    expect(status()).toBe('Bloco 2 removido.');
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeTruthy();
    expect(titles()).toEqual(['A', 'C']);
  });

  it('o desfazer fica por 10 s e some depois', () => {
    // Timers falsos: o `userEvent` espera timers de verdade; o clique aqui é síncrono.
    vi.useFakeTimers();
    renderEditor({ defaultValues: three });
    fireEvent.click(screen.getByRole('button', { name: 'Remover bloco 1' }));

    act(() => {
      vi.advanceTimersByTime(UNDO_MS - 1);
    });
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
    expect(status()).toBe('');
    expect(UNDO_MS).toBeGreaterThanOrEqual(10_000);
  });

  it('desfazer devolve no mesmo índice, com os valores editados, o mesmo n e o foco', async () => {
    const user = userEvent.setup();
    const action = renderEditor({ defaultValues: three });
    const second = screen.getAllByLabelText('Título do sumário')[1] as HTMLElement;
    await user.clear(second);
    await user.type(second, 'B editado');

    await remove(user, 2);
    await user.click(screen.getByRole('button', { name: 'Desfazer' }));

    expect(titles()).toEqual(['A', 'B editado', 'C']);
    expect(screen.getByRole('group', { name: 'Bloco 2: Sumário' })).toBeTruthy();
    expect(status()).toBe('Bloco 2 devolvido.');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getAllByLabelText('Título do sumário')[1]),
    );
    await save(user);
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0]?.[0].blocks).toEqual([
      toc(1, 'A'),
      toc(2, 'B editado'),
      toc(3, 'C'),
    ]);
  });

  it('remover outro bloco troca o desfazer pelo da remoção mais recente', async () => {
    const user = userEvent.setup();
    renderEditor({ defaultValues: three });

    await remove(user, 1);
    await remove(user, 2);
    expect(status()).toBe('Bloco 2 removido.');
    expect(screen.getAllByRole('button', { name: 'Desfazer' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(titles()).toEqual(['B', 'C']);
  });

  it('salvar descarta o desfazer', async () => {
    const user = userEvent.setup();
    renderEditor({ defaultValues: three });

    await remove(user, 3);
    await save(user);

    expect(await screen.findByText('Versão 2 salva.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
  });
});

describe('controles de bloco com ícones (#131)', () => {
  it('mover e remover são botões de ícone com a posição no nome; as pontas ficam indisponíveis e focáveis', async () => {
    const user = userEvent.setup();
    renderEditor();

    for (const name of ['Mover bloco 2 para cima', 'Mover bloco 2 para baixo', 'Remover bloco 2']) {
      const button = screen.getByRole('button', { name });
      // O texto visível é só a dica, fora da árvore de acessibilidade.
      expect(button.lastElementChild?.getAttribute('aria-hidden')).toBe('true');
      expect(button.lastElementChild?.textContent).toBe(name);
      expect(button.querySelector('svg')).toBeTruthy();
    }
    const first = screen.getByRole('button', { name: 'Mover bloco 1 para cima' });
    const last = screen.getByRole('button', { name: 'Mover bloco 3 para baixo' });
    expect(first.getAttribute('aria-disabled')).toBe('true');
    expect(last.getAttribute('aria-disabled')).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Mover bloco 2 para cima' }).getAttribute('aria-disabled'),
    ).toBe('false');

    first.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(first);
    expect(
      screen
        .getAllByLabelText('Título do sumário')
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(['A', 'B', 'C']);
  });
});

describe('inserir bloco em qualquer posição (#134)', () => {
  const three = { ...meta, blocks: [toc(1, 'A'), toc(2, 'B'), toc(3, 'C')] };
  const listOf = (trigger: HTMLElement) => {
    const list = document.getElementById(trigger.getAttribute('popovertarget') ?? '');
    if (list === null) throw new Error('gatilho sem lista');
    return list;
  };

  it('há um ponto antes de cada bloco, com a posição no nome e os tipos da release', () => {
    renderEditor({ defaultValues: three, blockTypes: ['text', 'toc', 'image'] });

    const triggers = screen.getAllByRole('button', { name: /^Inserir bloco na posição/ });
    expect(triggers.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Inserir bloco na posição 1',
      'Inserir bloco na posição 2',
      'Inserir bloco na posição 3',
    ]);
    expect(
      [...listOf(triggers[1] as HTMLElement).querySelectorAll('button')].map((b) => b.textContent),
    ).toEqual(['Texto', 'Sumário', 'Imagem']);
  });

  it('escolher um tipo insere ali, renumera os seguintes, fecha a lista e leva o foco ao bloco novo', async () => {
    const user = userEvent.setup();
    const action = renderEditor({ defaultValues: three });
    const trigger = screen.getByRole('button', { name: 'Inserir bloco na posição 2' });
    const list = listOf(trigger);
    const hide = vi.fn();
    list.hidePopover = hide;

    await user.click(within(list).getByRole('button', { name: 'Sumário' }));

    expect(hide).toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Bloco 2: Sumário' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remover bloco 4' })).toBeTruthy();
    const titles = screen.getAllByLabelText<HTMLInputElement>('Título do sumário');
    expect(titles.map((input) => input.value)).toEqual(['A', '', 'B', 'C']);
    await waitFor(() => expect(document.activeElement).toBe(titles[1]));

    await user.type(titles[1] as HTMLElement, 'Novo');
    await save(user);
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0]?.[0].blocks).toEqual([
      toc(1, 'A'),
      { new: true, type: 'toc', title: 'Novo' },
      toc(2, 'B'),
      toc(3, 'C'),
    ]);
  });

  it('sem blocos, só o "Adicionar bloco"', () => {
    renderEditor({ mode: 'create', defaultValues: { ...meta, blocks: [] } });

    expect(screen.queryByRole('button', { name: /^Inserir bloco/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Adicionar bloco' })).toBeTruthy();
  });
});

describe('recolher e expandir blocos (#135)', () => {
  const three = { ...meta, blocks: [toc(1, 'A'), toc(2, 'Neste guia'), toc(3, 'C')] };
  const toggle = (position: number) =>
    screen.getByRole('button', { name: `Conteúdo do bloco ${position}` });
  const body = (button: HTMLElement) =>
    document.getElementById(button.getAttribute('aria-controls') ?? '');

  it('o botão do bloco alterna aria-expanded, mostra o resumo com o texto em title e mantém o foco', async () => {
    const user = userEvent.setup();
    renderEditor({ defaultValues: three });
    const button = toggle(2);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(body(button)?.hidden).toBe(false);

    await user.click(button);

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(body(button)?.hidden).toBe(true);
    const group = screen.getByRole('group', { name: 'Bloco 2: Sumário' });
    const summary = within(group).getByText('Neste guia');
    expect(summary.getAttribute('title')).toBe('Neste guia');
    expect(summary.className).toContain('truncate');
    expect(document.activeElement).toBe(button);

    button.focus();
    await user.keyboard('{Enter}');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(within(group).queryByText('Neste guia', { selector: 'span' })).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('expandir mostra o conteúdo intacto, inclusive o rich text editado antes de recolher', async () => {
    const user = userEvent.setup();
    renderEditor({
      defaultValues: {
        ...meta,
        blocks: [
          {
            n: 1,
            type: 'text',
            content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Olá' }] }],
          },
        ],
      },
    });
    const editor = await screen.findByRole('textbox', { name: 'Texto' });
    await user.click(editor);
    // Substitui o texto (o happy-dom não move o cursor com End num contenteditable).
    await user.keyboard('{Control>}a{/Control}Olá mundo editado');

    await user.click(toggle(1));
    expect(screen.getByRole('group', { name: 'Bloco 1: Texto' }).textContent).toContain(
      'Olá mundo editado',
    );
    await user.click(toggle(1));

    expect(screen.getByRole('textbox', { name: 'Texto' }).textContent).toBe('Olá mundo editado');
  });

  it('"Recolher todos" e "Expandir todos" no topo da seção Blocos', async () => {
    const user = userEvent.setup();
    renderEditor({ defaultValues: three });
    const states = () =>
      [1, 2, 3].map((position) => toggle(position).getAttribute('aria-expanded'));

    await user.click(screen.getByRole('button', { name: 'Recolher todos' }));
    expect(states()).toEqual(['false', 'false', 'false']);
    await user.click(screen.getByRole('button', { name: 'Expandir todos' }));
    expect(states()).toEqual(['true', 'true', 'true']);
  });

  it('salvar mantém recolhido o que estava recolhido', async () => {
    const user = userEvent.setup();
    renderEditor({
      defaultValues: three,
      result: { ok: true, message: 'Versão 2 salva.', id: 7, saved: three as never },
    });
    await user.click(toggle(2));

    await save(user);
    await screen.findByText('Versão 2 salva.');

    expect([1, 2, 3].map((position) => toggle(position).getAttribute('aria-expanded'))).toEqual([
      'true',
      'false',
      'true',
    ]);
  });

  it('erro de validação num bloco recolhido o expande e o foco chega ao campo', async () => {
    const user = userEvent.setup();
    const action = renderEditor({
      defaultValues: { ...meta, blocks: [{ n: 1, type: 'image', mediaId: 1 }] },
    });
    await user.click(toggle(1));

    await save(user);

    await waitFor(() => expect(toggle(1).getAttribute('aria-expanded')).toBe('true'));
    const alt = screen.getByLabelText('Texto alternativo');
    await waitFor(() => expect(document.activeElement).toBe(alt));
    expect(action).not.toHaveBeenCalled();
  });

  it('erro do servidor num bloco recolhido também o expande e foca o campo', async () => {
    const user = userEvent.setup();
    renderEditor({
      defaultValues: three,
      result: {
        ok: false,
        message: 'Não foi possível salvar o conteúdo.',
        issues: [{ path: ['blocks', 2, 'title'], message: 'Título recusado' }],
      },
    });
    await user.click(screen.getByRole('button', { name: 'Recolher todos' }));

    await save(user);

    await screen.findByText('Título recusado');
    expect(toggle(3).getAttribute('aria-expanded')).toBe('true');
    expect(toggle(1).getAttribute('aria-expanded')).toBe('false');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getAllByLabelText('Título do sumário')[2]),
    );
  });

  it('a data de publicação é um seletor no fuso do site, gravado com o offset dele (#183)', async () => {
    const user = userEvent.setup();
    const action = renderEditor();

    const date = screen.getByLabelText('Data de publicação');
    expect(date.getAttribute('type')).toBe('datetime-local');
    expect((date as HTMLInputElement).value).toBe('2026-10-06T12:00');
    expect(document.getElementById(date.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Horário de America/Sao_Paulo',
    );

    fireEvent.change(date, { target: { value: '2026-10-07T09:15' } });
    await save(user);

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0]?.[0].publishedAt).toBe('2026-10-07T09:15:00-03:00');
  });
});
