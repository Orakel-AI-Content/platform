import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import type { ContentListItem } from '@/domain/content/contents.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { cellsOverLines, pageOverflow, tableOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { ListScreen, renderInFrame } from '../../../test/browser/render.tsx';
import { ContentsTable } from './ContentsTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Lista de conteúdos cheia em Chromium (#460; antes no E2E, `contents.spec.ts`, #273): com 30
// conteúdos e a página de 25, a 1280 px, na moldura do admin, nada rola na horizontal e nenhuma
// célula passa de duas linhas de texto; o axe roda nos dois temas. Os títulos são os do seed do
// E2E (`Receita N`): com um título longo, a tabela passa da janela, um defeito que o E2E também
// não cobria (fica para uma issue própria, #460 não muda o visual).

const SITE = 'exemplo-a';
const STATUSES = ['rascunho', 'em_revisao', 'aprovado', 'agendado', 'publicado', 'despublicado'];

const ROWS: ContentListItem[] = Array.from({ length: 30 }, (_, index) => ({
  id: 1000 + index,
  kind: index % 2 === 0 ? 'article' : 'page',
  title: `Receita ${index + 1}`,
  slug: `conteudo-${index + 1}`,
  status: STATUSES[index % STATUSES.length] as ContentListItem['status'],
  version: index + 1,
  updatedAt: new Date('2026-10-20T12:00Z'),
  live: index % 3 !== 0,
}));

function Contents({ canPublish = false }: { canPublish?: boolean }) {
  return (
    <ListScreen title="Conteúdos">
      <ContentsTable
        siteId={SITE}
        timeZone="America/Sao_Paulo"
        rows={ROWS}
        canWrite
        canPublish={canPublish}
        unpublishAction={() => Promise.resolve({ ok: true, message: 'Despublicados.' })}
        labelledBy="lista-titulo"
      />
    </ListScreen>
  );
}

const table = () => page.getByRole('table', { name: 'Conteúdos', exact: true });

beforeEach(() => {
  navigation.set(`/sites/${SITE}/conteudos`);
});

afterEach(() => {
  navigation.set('/');
});

describe('ContentsTable no navegador', () => {
  it('cheia a 1280 px, sem rolagem horizontal e com até duas linhas por célula', async () => {
    await renderInFrame(<Contents />);
    expect(table().element().querySelectorAll('tbody tr')).toHaveLength(25);

    expect(pageOverflow()).toBe(0);
    expect(tableOverflow(table())).toBe(0);
    expect(cellsOverLines(table())).toEqual([]);
  });

  it.each(COLOR_SCHEMES)('sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Contents />);
    expect(await audit()).toEqual([]);
  });

  // Seleção da despublicação em massa (#495): caixas só nos conteúdos no ar e a barra dos
  // selecionados.
  it('com seleção, a 1280 px, sem rolagem horizontal e com até duas linhas por célula', async () => {
    await renderInFrame(<Contents canPublish />);
    await page.getByRole('checkbox', { name: 'Selecionar todas as linhas' }).click();
    await expect.element(page.getByRole('button', { name: 'Despublicar em massa' })).toBeVisible();

    expect(pageOverflow()).toBe(0);
    expect(tableOverflow(table())).toBe(0);
    expect(cellsOverLines(table())).toEqual([]);
  });

  it.each(COLOR_SCHEMES)('com seleção, sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Contents canPublish />);
    await page.getByRole('checkbox', { name: 'Selecionar Receita 2' }).click();
    await expect.element(page.getByText('1 conteúdo selecionado')).toBeVisible();

    expect(await audit()).toEqual([]);
  });

  it('o teclado marca a caixa com Espaço, sem perder o foco, e chega à barra', async () => {
    await renderInFrame(<Contents canPublish />);
    const box = page.getByRole('checkbox', { name: 'Selecionar Receita 2' });
    (box.element() as HTMLInputElement).focus();

    await userEvent.keyboard(' ');
    await expect.element(box).toBeChecked();
    expect(document.activeElement).toBe(box.element());
    // A Receita 1 (índice 0) não está no ar: sem caixa.
    expect(page.getByRole('checkbox', { name: 'Selecionar Receita 1' }).query()).toBeNull();

    const button = page.getByRole('button', { name: 'Despublicar em massa' });
    for (let step = 0; step < 80 && document.activeElement !== button.element(); step++) {
      await userEvent.keyboard('{Tab}');
    }
    expect(document.activeElement).toBe(button.element());
    await userEvent.keyboard('{Enter}');
    await expect
      .element(page.getByRole('alertdialog', { name: 'Despublicar 1 conteúdo?' }))
      .toBeVisible();
  });
});
