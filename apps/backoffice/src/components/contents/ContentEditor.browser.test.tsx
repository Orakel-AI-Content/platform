import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { navigation } from '../../../test/browser/navigation.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import { ContentEditor, type ContentEditorOptions } from './ContentEditor.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Blocos do editor de conteúdo em Chromium (#476; antes no E2E, `contents.spec.ts`), com 20
// sumários: inserir um bloco no meio só pelo teclado, pelo Dropdown do Ecme (#134, #274), com o
// Esc devolvendo o foco ao gatilho e o foco no campo do bloco novo; recolher e expandir blocos
// só pelo teclado (#135), com o bloco recolhido numa linha e o título no `title`.

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
