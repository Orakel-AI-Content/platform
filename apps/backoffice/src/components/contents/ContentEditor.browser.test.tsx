import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import type { ContentEdit } from '@/domain/content/contents.ts';

import { audit, COLOR_SCHEMES, setTheme } from '../../../test/browser/a11y.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import { ContentEditor, type ContentEditorOptions } from './ContentEditor.tsx';
import type { ContentFormResult } from './contentEditorValues.ts';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Blocos do editor de conteúdo em Chromium (#476; antes no E2E, `contents.spec.ts`), com 20
// sumários: inserir um bloco no meio só pelo teclado, pelo Dropdown do Ecme (#134, #274), com o
// Esc devolvendo o foco ao gatilho e o foco no campo do bloco novo; recolher e expandir blocos
// só pelo teclado (#135), com o bloco recolhido numa linha e o título no `title`. Na edição sem
// alteração (#525), "Salvar" fica indisponível e focável, com a nota que diz por quê.

const options: ContentEditorOptions = {
  blockTypes: ['text', 'toc', 'quote', 'image', 'faq'],
  media: {
    load: (page) => Promise.resolve({ items: [], total: 0, page, pageSize: 24 }),
    byIds: () => Promise.resolve([]),
  },
  authors: [],
  taxonomies: [],
};

const defaultValues = {
  kind: 'article',
  slug: 'artigo-longo',
  title: 'Artigo longo',
  authorIds: [],
  taxonomyIds: [],
  publishedAt: '2026-10-06T12:00:00-03:00',
  blocks: Array.from({ length: 20 }, (_, index) => ({
    n: index + 1,
    type: 'toc',
    title: `Seção ${index + 1}`,
  })),
};

const EDIT_PATH = '/sites/exemplo-a/conteudos/7/editar';

function renderEditor() {
  return renderInApp(
    <ContentEditor
      mode="edit"
      siteId="exemplo-a"
      timeZone="America/Sao_Paulo"
      defaultValues={defaultValues}
      options={options}
      action={() => Promise.resolve({ ok: true, message: 'Versão 2 salva.', id: 7 })}
      backHref="/sites/exemplo-a/conteudos/7"
    />,
  );
}

const blocks = () => page.getByRole('group', { name: /^Bloco \d+:/ }).elements();

beforeEach(() => {
  navigation.set(EDIT_PATH);
});

afterEach(() => {
  navigation.set('/');
});

describe('blocos do editor no navegador', () => {
  it('insere um bloco no meio só pelo teclado; Esc fecha a lista e devolve o foco (#134)', async () => {
    await renderEditor();
    const trigger = page.getByRole('button', { name: 'Inserir bloco na posição 2', exact: true });
    const menu = page.getByRole('menu');

    // O Dropdown do Ecme (#274): Enter abre o menu, Esc fecha e devolve o foco ao gatilho.
    (trigger.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(menu).toBeVisible();
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    await expect.element(menu).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();

    // Abre de novo e chega ao "Sumário" pelas setas.
    await userEvent.keyboard('{Enter}');
    const toc = menu.getByRole('menuitem', { name: 'Sumário' });
    await expect.element(menu.getByRole('menuitem').first()).toHaveFocus();
    for (let step = 0; step < 6; step += 1) {
      if (toc.element() === document.activeElement) break;
      await userEvent.keyboard('{ArrowDown}');
    }
    await expect.element(toc).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    await expect.element(menu).not.toBeInTheDocument();
    const inserted = page.getByRole('group', { name: 'Bloco 2: Sumário', exact: true });
    await expect.element(inserted.getByLabelText('Título do sumário')).toHaveFocus();
    await expect.element(inserted.getByLabelText('Título do sumário')).toHaveValue('');
    expect(blocks()).toHaveLength(21);
    await expect
      .element(page.getByRole('button', { name: 'Remover bloco 21', exact: true }))
      .toBeInTheDocument();
  });

  it('recolhe e expande blocos só pelo teclado; recolhido, o bloco ocupa uma linha (#135)', async () => {
    await renderEditor();
    const toggle = page.getByRole('button', { name: 'Conteúdo do bloco 1', exact: true });
    const group = page.getByRole('group', { name: 'Bloco 1: Sumário', exact: true });

    (toggle.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect.element(toggle).toHaveFocus();
    await expect
      .element(group.getByText('Seção 1', { exact: true }))
      .toHaveAttribute('title', 'Seção 1');
    await expect.element(group.getByLabelText('Título do sumário')).not.toBeVisible();
    // Uma linha: a altura do bloco é a do cabeçalho (botões de 32 px) mais o espaçamento.
    expect(group.element().getBoundingClientRect().height).toBeLessThanOrEqual(72);

    await userEvent.keyboard('{Enter}');
    await expect.element(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect.element(group.getByLabelText('Título do sumário')).toHaveValue('Seção 1');

    const toggles = (expanded: boolean) =>
      document.querySelectorAll(
        `button[aria-label^="Conteúdo do bloco"][aria-expanded="${expanded}"]`,
      ).length;
    (page.getByRole('button', { name: 'Recolher todos' }).element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.poll(() => toggles(false)).toBe(20);
    (page.getByRole('button', { name: 'Expandir todos' }).element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.poll(() => toggles(true)).toBe(20);
  });
});

describe('salvar sem alteração (#525)', () => {
  const NOTE = 'Nenhuma alteração para salvar.';

  async function renderWithAction(
    mode: 'create' | 'edit' = 'edit',
    respond: (input: ContentEdit) => Promise<ContentFormResult> = () =>
      Promise.resolve({ ok: true, message: 'Versão 2 salva.', id: 7 }),
  ) {
    const action = vi.fn(respond);
    const screen = await renderInApp(
      <ContentEditor
        mode={mode}
        siteId="exemplo-a"
        timeZone="America/Sao_Paulo"
        defaultValues={defaultValues}
        options={options}
        action={action}
        backHref="/sites/exemplo-a/conteudos/7"
      />,
    );
    return { action, screen };
  }

  const save = () => page.getByRole('button', { name: 'Salvar', exact: true });
  const title = () => page.getByRole('textbox', { name: 'Título', exact: true });
  // O Playwright não clica em `aria-disabled`: o clique nativo chega ao botão, como o da pessoa.
  const clickSave = () => (save().element() as HTMLElement).click();

  const expectUnchanged = async () => {
    await expect.element(save()).toHaveAttribute('aria-disabled', 'true');
    await expect.element(save()).toHaveAccessibleDescription(NOTE);
    await expect.element(page.getByText(NOTE, { exact: true })).toBeVisible();
  };
  const expectChanged = async () => {
    await expect.element(save()).not.toHaveAttribute('aria-disabled');
    await expect.element(save()).not.toHaveAccessibleDescription(NOTE);
    await expect.element(page.getByText(NOTE, { exact: true })).not.toBeInTheDocument();
  };

  it('aberto sem mudança: Salvar indisponível, focável e com o motivo; clique e Enter não enviam', async () => {
    const { action } = await renderWithAction();
    await expectUnchanged();

    (save().element() as HTMLElement).focus();
    await expect.element(save()).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    clickSave();
    (title().element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    expect(action).not.toHaveBeenCalled();

    for (const scheme of COLOR_SCHEMES) {
      await setTheme(scheme);
      expect(await audit()).toEqual([]);
    }
  });

  it('alterar um campo libera o envio; desfazer volta a "sem alteração"', async () => {
    const { action } = await renderWithAction();

    await userEvent.type(title(), 'x');
    await expectChanged();
    await userEvent.keyboard('{Backspace}');
    await expectUnchanged();

    await userEvent.type(title(), '!');
    await userEvent.click(save());
    await expect.poll(() => action.mock.calls.length).toBe(1);
    expect(action.mock.calls[0]?.[0].title).toBe('Artigo longo!');
  });

  it('adicionar, remover e mover bloco liberam o envio', async () => {
    const steps: (() => Promise<void>)[] = [
      async () => {
        await userEvent.click(page.getByRole('button', { name: 'Remover bloco 2', exact: true }));
      },
      async () => {
        await userEvent.click(
          page.getByRole('button', { name: 'Mover bloco 1 para baixo', exact: true }),
        );
      },
      async () => {
        const trigger = page.getByRole('button', {
          name: 'Inserir bloco na posição 2',
          exact: true,
        });
        await userEvent.click(trigger);
        await userEvent.click(page.getByRole('menuitem', { name: 'Sumário' }));
      },
    ];
    for (const step of steps) {
      const { action, screen } = await renderWithAction();
      await expectUnchanged();
      await step();
      await expectChanged();
      await userEvent.click(save());
      await expect.poll(() => action.mock.calls.length).toBe(1);
      await screen.unmount();
    }
  });

  it('depois de salvar, volta a "sem alteração"', async () => {
    const { action } = await renderWithAction('edit', (input) =>
      Promise.resolve({
        ok: true,
        message: 'Versão 2 salva.',
        id: 7,
        saved: { ...defaultValues, title: input.title } as never,
      }),
    );

    await userEvent.type(title(), '!');
    await expectChanged();
    await userEvent.click(save());
    await expect.poll(() => action.mock.calls.length).toBe(1);
    await expectUnchanged();
    await expect.element(title()).toHaveValue('Artigo longo!');
  });

  it('criação: "Criar" envia com o formulário intocado', async () => {
    const { action } = await renderWithAction('create');
    const create = page.getByRole('button', { name: 'Criar', exact: true });
    await expect.element(create).not.toHaveAttribute('aria-disabled');
    await expect.element(page.getByText(NOTE, { exact: true })).not.toBeInTheDocument();
    await userEvent.click(create);
    await expect.poll(() => action.mock.calls.length).toBe(1);
  });
});

describe('título, slug e SEO no navegador (#590)', () => {
  it('na criação, o slug acompanha o título; a contagem do SEO é a descrição do campo; sem violações do axe', async () => {
    await renderInApp(
      <ContentEditor
        mode="create"
        siteId="exemplo-a"
        timeZone="America/Sao_Paulo"
        defaultValues={{ ...defaultValues, slug: '', title: '' }}
        options={options}
        action={() => Promise.resolve({ ok: true, message: 'Conteúdo criado.', id: 7 })}
        backHref="/sites/exemplo-a/conteudos"
      />,
    );
    const title = page.getByRole('textbox', { name: 'Título', exact: true });
    const slug = page.getByRole('textbox', { name: 'Slug', exact: true });
    const seoTitle = page.getByRole('textbox', { name: 'Título para buscadores' });

    await userEvent.type(title, 'Como começar uma horta');
    await expect.element(slug).toHaveValue('como-comecar-uma-horta');

    await expect.element(seoTitle).toHaveAccessibleDescription('0 caracteres');
    await userEvent.type(seoTitle, 'Horta');
    await expect.element(seoTitle).toHaveAccessibleDescription('5 caracteres');

    for (const scheme of COLOR_SCHEMES) {
      await setTheme(scheme);
      expect(await audit()).toEqual([]);
    }
  });
});
