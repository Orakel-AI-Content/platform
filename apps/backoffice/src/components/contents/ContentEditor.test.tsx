// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FieldValues } from 'react-hook-form';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { toast, ToastProvider } from '@/components/ui/toast';
import type { ContentEdit } from '@/domain/content/contents.ts';

import type { ContentFormResult } from './contentEditorValues.ts';
import { LEAVE_MESSAGE } from '@/components/shared/useLeaveGuard.ts';

import { ContentEditor, UNDO_MS, type ContentEditorOptions } from './ContentEditor.tsx';
import { fieldLabel } from '@/test/fieldLabel.ts';

// Editor de conteúdo (#45): tipos da release, seletores do site, teclado e erros por campo. O
// retorno é o padrão das ações (#326): sucesso e "Desfazer" no toast, resumo de erros no Alert.

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/sites/exemplo-a/conteudos/7/editar',
}));

// A mensagem de erro do FormItem (#245) anima com o motion, que o happy-dom cancela no `cleanup`.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

afterEach(async () => {
  act(() => toast.removeAll());
  await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
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

/** "Voltar" da edição: o conteúdo, nível anterior da trilha. */
const BACK = '/sites/exemplo-a/conteudos/7';

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
    <>
      <ContentEditor
        mode={mode}
        siteId="exemplo-a"
        timeZone="America/Sao_Paulo"
        defaultValues={defaultValues}
        options={{ ...options, blockTypes }}
        action={action}
        backHref={mode === 'create' ? '/sites/exemplo-a/conteudos' : BACK}
        created={created}
        previewUrl={previewUrl}
      />
      <ToastProvider />
    </>,
  );
  return action;
}

/** Escolhe o tipo do novo bloco só com teclado: digita para filtrar e confirma. */
async function chooseNewType(user: ReturnType<typeof userEvent.setup>, label: string) {
  screen.getByRole('combobox', { name: 'Tipo do novo bloco' }).focus();
  await user.keyboard(label);
  await user.keyboard('{Enter}');
}

const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /Salvar nova versão|Criar conteúdo/ }));

describe('editor de conteúdo', () => {
  it('o tipo de bloco novo só oferece os tipos da release', async () => {
    renderEditor({ blockTypes: ['text', 'toc', 'image'] });

    screen.getByRole('combobox', { name: 'Tipo do novo bloco' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Texto',
      'Sumário',
      'Imagem',
    ]);
  });

  it('autores e taxonomias são escolhidos no Select múltiplo e vão como os mesmos IDs', async () => {
    const user = userEvent.setup();
    const action = renderEditor();

    screen.getByRole('combobox', { name: fieldLabel('Autores') }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Ana', 'Bia']);
    await user.keyboard('{ArrowDown}{Enter}{Escape}');
    screen.getByRole('combobox', { name: fieldLabel('Taxonomias') }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Receitas (categoria)' })).toBeTruthy();
    await user.keyboard('{Enter}{Escape}');
    await save(user);

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0]?.[0]).toMatchObject({ authorIds: [2], taxonomyIds: [1] });
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
    // Fica no editor (#109): confirmação no toast e o cabeçalho atualizado, sem navegar.
    expect(await screen.findByText('Versão 2 salva.')).toBeTruthy();
    // Salvar também tira o toast do "Desfazer" da remoção.
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Versão 2 salva.'));
    expect(router.refresh).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('bloco adicionado vai como novo, sem n', async () => {
    const user = userEvent.setup();
    const action = renderEditor({ mode: 'create', defaultValues: { ...meta, blocks: [] } });

    await chooseNewType(user, 'Sumário');
    await user.click(screen.getByRole('button', { name: 'Adicionar bloco' }));
    await user.type(screen.getByLabelText(fieldLabel('Título do sumário')), 'Neste guia');
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

    const alt = await screen.findByLabelText(fieldLabel('Texto alternativo'));
    await waitFor(() => expect(alt.getAttribute('aria-invalid')).toBe('true'));
    const describedBy = alt.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy.split(' ').at(-1) ?? '')?.textContent).toBe(
      'Informe o texto alternativo ou marque a imagem como decorativa',
    );
    expect(action).not.toHaveBeenCalled();
  });

  it('sem blocos: o erro da lista é a mensagem do FormItem, ligada à seção Blocos (#329)', async () => {
    const user = userEvent.setup();
    const action = renderEditor({ mode: 'create', defaultValues: { ...meta, blocks: [] } });

    await save(user);

    const blocks = screen.getByRole('region', { name: 'Blocos' });
    await waitFor(() => {
      const [error] = (blocks.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id));
      expect(error?.textContent).toBe('Adicione ao menos um bloco');
      expect(error?.className).toContain('form-explain');
    });
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
  it('a barra fixa (#332) reúne Voltar, Ver prévia, o envio no mesmo tamanho e o resumo de erros; o sucesso vai para o toast', () => {
    // A fixação no rodapé é visual: o E2E contents.spec.ts confere.
    renderEditor();

    const submit = screen.getByRole('button', { name: 'Salvar nova versão' });
    const bar = submit.closest('.sticky');
    expect(bar).not.toBeNull();
    const back = screen.getByRole('link', { name: 'Voltar' });
    expect(back.getAttribute('href')).toBe(BACK);
    const preview = screen.getByRole('button', { name: 'Ver prévia' });
    for (const control of [back, preview]) expect(bar?.contains(control)).toBe(true);
    // O mesmo `size` (o padrão, `md`) nos três.
    for (const control of [back, preview, submit]) expect(control.className).toContain('h-12');
    expect(bar?.querySelector('[role="alert"]')).toBeTruthy();
    expect(bar?.querySelector('[role="status"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull();
  });

  it('metadados e cada bloco ficam num Card (#332)', () => {
    renderEditor();

    const meta = screen.getByRole('region', { name: 'Dados do conteúdo' });
    expect(meta.querySelector('.card')).toBeTruthy();
    for (const position of [1, 2, 3]) {
      const block = screen.getByRole('group', { name: `Bloco ${position}: Sumário` });
      expect(block.closest('.card')).toBeTruthy();
    }
  });

  it('o resumo de validação usa o Alert do Ecme e o foco vai ao primeiro campo inválido', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.clear(screen.getByLabelText(fieldLabel('Título'), { exact: true }));
    await save(user);

    const alert = screen.getByRole('alert');
    await waitFor(() => expect(alert.textContent).toBe('Corrija os campos destacados.'));
    expect(alert.querySelector('.alert')).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByLabelText(fieldLabel('Título'), { exact: true }),
      ),
    );
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

  it('criação (#332): "Criando…" durante o envio, e Descartar no lugar de Voltar', async () => {
    const user = userEvent.setup();
    let finish: (result: ContentFormResult) => void = () => {};
    renderEditor({
      mode: 'create',
      respond: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    expect(screen.queryByRole('link', { name: 'Voltar' })).toBeNull();

    await save(user);
    const button = await screen.findByRole('button', { name: 'Criando…' });
    expect(button).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Descartar' })).toHaveProperty('disabled', true);

    act(() => finish({ ok: true, message: 'Conteúdo criado.', id: 7 }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/sites/exemplo-a/conteudos/7/editar?criado=1'),
    );
  });

  it('recomeça da versão salva: o bloco novo ganha o n do servidor e salvar de novo não duplica', async () => {
    const user = userEvent.setup();
    const saved = { ...meta, blocks: [toc(1, 'A'), toc(4, 'Novo')] };
    const action = renderEditor({
      defaultValues: { ...meta, blocks: [toc(1, 'A')] },
      result: { ok: true, message: 'Versão 2 salva.', id: 7, saved: saved as never },
    });

    await chooseNewType(user, 'Sumário');
    await user.click(screen.getByRole('button', { name: 'Adicionar bloco' }));
    const titles = screen.getAllByLabelText(fieldLabel('Título do sumário'));
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

    await user.type(screen.getByLabelText(fieldLabel('Título'), { exact: true }), ' revisado');
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
    const title = screen.getByLabelText(fieldLabel('Título'), { exact: true });
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

  it('Voltar (#332), com alterações, pergunta antes e, recusado, fica no editor', async () => {
    window.confirm = confirm;
    const user = userEvent.setup();
    renderEditor();
    const back = screen.getByRole('link', { name: 'Voltar' });
    const clicks: MouseEvent[] = [];
    const record = (event: MouseEvent) => {
      if (event.target instanceof Node && back.contains(event.target)) clicks.push(event);
    };
    document.addEventListener('click', record);
    try {
      await user.type(screen.getByLabelText(fieldLabel('Título'), { exact: true }), '!');
      await waitFor(() => expect(leave()).toBe(true));
      await user.click(back);
    } finally {
      document.removeEventListener('click', record);
    }

    expect(confirm).toHaveBeenCalledWith(LEAVE_MESSAGE);
    // Ficar cancela o clique já na captura do `window`: nem o `Link` nem o resto o recebem.
    expect(clicks).toEqual([]);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('Descartar (#332) só sai depois de confirmado no diálogo, sem um segundo aviso', async () => {
    window.confirm = confirm;
    const user = userEvent.setup();
    renderEditor({ mode: 'create' });

    await user.type(screen.getByLabelText(fieldLabel('Título'), { exact: true }), '!');
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Descartar o que foi preenchido?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(router.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Descartar' }),
    );
    expect(router.push).toHaveBeenCalledWith('/sites/exemplo-a/conteudos');
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('desfazer a remoção de bloco (#112)', () => {
  const three = { ...meta, blocks: [toc(1, 'A'), toc(2, 'B'), toc(3, 'C')] };
  const status = () => screen.getByRole('status').textContent;
  const undo = () => screen.queryByRole('button', { name: 'Desfazer' });
  const titles = () =>
    screen
      .getAllByLabelText<HTMLInputElement>(fieldLabel('Título do sumário'))
      .map((input) => input.value);
  const remove = (user: ReturnType<typeof userEvent.setup>, position: number) =>
    user.click(screen.getByRole('button', { name: `Remover bloco ${position}` }));

  afterEach(() => {
    vi.useRealTimers();
  });

  it('remover mostra o toast "Bloco N removido." com o botão Desfazer, fora da barra', async () => {
    const user = userEvent.setup();
    renderEditor({ defaultValues: three });

    await remove(user, 2);

    expect(status()).toBe('Bloco 2 removido.Desfazer');
    expect(screen.getByRole('status').contains(undo())).toBe(true);
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
      // O prazo, e a saída do toast (50 ms) depois dele.
      vi.advanceTimersByTime(1 + 100);
    });
    expect(undo()).toBeNull();
    expect(status()).toBe('');
    expect(UNDO_MS).toBeGreaterThanOrEqual(10_000);
  });

  it('desfazer devolve no mesmo índice, com os valores editados, o mesmo n e o foco', async () => {
    const user = userEvent.setup();
    const action = renderEditor({ defaultValues: three });
    const second = screen.getAllByLabelText(fieldLabel('Título do sumário'))[1] as HTMLElement;
    await user.clear(second);
    await user.type(second, 'B editado');

    await remove(user, 2);
    await user.click(screen.getByRole('button', { name: 'Desfazer' }));

    expect(titles()).toEqual(['A', 'B editado', 'C']);
    expect(screen.getByRole('group', { name: 'Bloco 2: Sumário' })).toBeTruthy();
    await waitFor(() => expect(status()).toBe('Bloco 2 devolvido.'));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getAllByLabelText(fieldLabel('Título do sumário'))[1],
      ),
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
    await waitFor(() => expect(status()).toBe('Bloco 2 removido.Desfazer'));
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
    await waitFor(() => expect(undo()).toBeNull());
  });

  it('sair do editor tira o toast do Desfazer', async () => {
    const user = userEvent.setup();
    renderEditor({ defaultValues: three });
    await remove(user, 1);
    expect(undo()).toBeTruthy();

    act(() => {
      cleanup();
    });
    render(<ToastProvider />);

    await waitFor(() => expect(undo()).toBeNull());
  });
});

describe('controles de bloco com ícones (#131)', () => {
  it('mover e remover são botões de ícone com a posição no nome; as pontas ficam indisponíveis e focáveis', async () => {
    const user = userEvent.setup();
    renderEditor();

    for (const name of ['Mover bloco 2 para cima', 'Mover bloco 2 para baixo', 'Remover bloco 2']) {
      const button = screen.getByRole('button', { name });
      // O IconButton do Ecme (#270): nome pelo aria-label, ícone fora da árvore de acessibilidade.
      expect(button.textContent).toBe('');
      expect(button.querySelector('svg')?.closest('[aria-hidden="true"]')).toBeTruthy();
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
        .getAllByLabelText(fieldLabel('Título do sumário'))
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(['A', 'B', 'C']);
  });
});

describe('inserir bloco em qualquer posição (#134)', () => {
  const three = { ...meta, blocks: [toc(1, 'A'), toc(2, 'B'), toc(3, 'C')] };
  /** Abre o Dropdown do gatilho pelo teclado e devolve o menu. */
  const openMenu = async (user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement) => {
    trigger.focus();
    await user.keyboard('{Enter}');
    return screen.findByRole('menu');
  };

  it('há um ponto antes de cada bloco, com a posição no nome e os tipos da release', async () => {
    const user = userEvent.setup();
    renderEditor({ defaultValues: three, blockTypes: ['text', 'toc', 'image'] });

    const triggers = screen.getAllByRole('button', { name: /^Inserir bloco na posição/ });
    expect(triggers.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Inserir bloco na posição 1',
      'Inserir bloco na posição 2',
      'Inserir bloco na posição 3',
    ]);
    // A dica é só visual: o nome não se repete como descrição.
    expect(triggers[1]?.hasAttribute('aria-describedby')).toBe(false);
    const menu = await openMenu(user, triggers[1] as HTMLElement);
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Texto', 'Sumário', 'Imagem']);
  });

  it('escolher um tipo insere ali, renumera os seguintes, fecha a lista e leva o foco ao bloco novo', async () => {
    const user = userEvent.setup();
    const action = renderEditor({ defaultValues: three });
    const trigger = screen.getByRole('button', { name: 'Inserir bloco na posição 2' });
    const menu = await openMenu(user, trigger);

    await user.click(within(menu).getByRole('menuitem', { name: 'Sumário' }));

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(screen.getByRole('group', { name: 'Bloco 2: Sumário' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remover bloco 4' })).toBeTruthy();
    const titles = screen.getAllByLabelText<HTMLInputElement>(fieldLabel('Título do sumário'));
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
    const alt = screen.getByLabelText(fieldLabel('Texto alternativo'));
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
      expect(document.activeElement).toBe(
        screen.getAllByLabelText(fieldLabel('Título do sumário'))[2],
      ),
    );
  });

  it('a data de publicação é um seletor no fuso do site, gravado com o offset dele (#183)', async () => {
    const user = userEvent.setup();
    const action = renderEditor();

    // DateTimepicker do Ecme (#331): combobox com a hora de parede do site.
    const date = screen.getByRole('combobox', { name: fieldLabel('Data de publicação') });
    expect(date).toHaveProperty('value', '06/10/2026 12:00');
    expect(document.getElementById(date.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Horário de America/Sao_Paulo',
    );

    await user.click(date);
    await user.click(screen.getByRole('button', { name: '7 de outubro de 2026' }));
    await user.click(screen.getByRole('textbox', { name: 'Hora' }));
    await user.keyboard('09');
    await user.click(screen.getByRole('textbox', { name: 'Minuto' }));
    await user.keyboard('15');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await save(user);

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0]?.[0].publishedAt).toBe('2026-10-07T09:15:00-03:00');
  });
});
