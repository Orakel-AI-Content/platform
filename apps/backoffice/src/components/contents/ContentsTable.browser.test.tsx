import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import type { ContentListItem } from '@/domain/content/contents.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import {
  cellsOverLines,
  columnLines,
  isClipped,
  pageOverflow,
  tableOverflow,
} from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { ListScreen, renderInFrame } from '../../../test/browser/render.tsx';
import { ContentsTable } from './ContentsTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Lista de conteúdos cheia em Chromium (#460; antes no E2E, `contents.spec.ts`, #273): com 30
// conteúdos e a página de 25, a 1280 px, na moldura do admin, nada rola na horizontal e nenhuma
// célula passa de duas linhas de texto; o axe roda nos dois temas. Os títulos são os do seed do
// E2E (`Receita N`), mais um de 45 caracteres e um longo demais: o título usa a largura que
// sobra e corta só quando falta espaço, sem a tabela passar da janela, e a data fica numa linha.
// A 1440 px, o de 45 aparece inteiro; sobram 352 px de texto, e o de 50 fica no limite (#585).

const SITE = 'exemplo-a';
const STATUSES = ['rascunho', 'em_revisao', 'aprovado', 'agendado', 'publicado', 'despublicado'];

const TITLE_45 = 'Como montar uma horta vertical na sua varanda';
const TOO_LONG =
  'Como montar uma horta vertical na varanda do apartamento em dez passos, com a lista de materiais, o substrato e a rega de cada espécie';

const ROWS: ContentListItem[] = Array.from({ length: 30 }, (_, index) => ({
  id: 1000 + index,
  kind: index % 2 === 0 ? 'article' : 'page',
  title: index === 4 ? TITLE_45 : index === 5 ? TOO_LONG : `Receita ${index + 1}`,
  slug: `conteudo-${index + 1}`,
  status: STATUSES[index % STATUSES.length] as ContentListItem['status'],
  version: index + 1,
  updatedAt: new Date('2026-10-20T12:00Z'),
  live: index % 3 !== 0,
  authors: index === 5 ? ['Ana Souza', 'Bruno Lima', 'Carla Mendes Albuquerque'] : ['Ana Souza'],
  liveSlug: index % 3 !== 0 ? `conteudo-${index + 1}` : null,
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
    expect(new Set(columnLines(table(), 'Última alteração'))).toEqual(new Set([1]));
    // O que não cabe continua cortado, com o inteiro em `title`.
    expect(isClipped(table().getByTitle(TOO_LONG, { exact: true }))).toBe(true);
  });

  it('a 1440 px, o título de 45 caracteres aparece inteiro', async () => {
    await page.viewport(1440, 900);
    await renderInFrame(<Contents />);

    expect(TITLE_45).toHaveLength(45);
    expect(isClipped(table().getByTitle(TITLE_45, { exact: true }))).toBe(false);
    expect(new Set(columnLines(table(), 'Última alteração'))).toEqual(new Set([1]));
    expect(tableOverflow(table())).toBe(0);
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
