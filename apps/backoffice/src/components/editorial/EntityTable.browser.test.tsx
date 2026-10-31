import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { cellsOverLines, pageOverflow, tableOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { ListScreen, renderInFrame } from '../../../test/browser/render.tsx';
import { ENTITY_CONFIG } from './entityConfig.ts';
import { EntityTable } from './EntityTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Lista editorial em Chromium (#460; antes no E2E, `editorial.spec.ts`, #282, #363): com 30
// autores e a página de 25, a 1280 px, na moldura do admin, nem a página nem a tabela rolam na
// horizontal e nenhuma célula passa de duas linhas. Autores, taxonomias e menus usam o mesmo
// `EntityTable`; a de autores, com a área de atuação longa e a coluna de editar, é a mais
// larga. O tamanho da página fica na URL (o roteador em memória), e remontar mantém a visão.

const SITE = 'exemplo-a';
const BASE = `/sites/${SITE}/autores`;
const LONG_NAME = 'Maria Aparecida dos Santos Albuquerque de Vasconcelos Neto';
const LONG_EXPERTISE = 'Culinária regional brasileira, confeitaria artesanal e fermentação natural';

const { list } = ENTITY_CONFIG.author;

const ROWS = Array.from({ length: 30 }, (_, index) =>
  list.row({
    id: index + 1,
    slug: `autor-${index + 1}`,
    name: index === 0 ? LONG_NAME : `Autor ${String(index + 1).padStart(2, '0')}`,
    expertise: index === 0 ? LONG_EXPERTISE : 'Receitas',
  }),
);

function Authors() {
  return (
    <ListScreen title="Autores">
      <EntityTable
        basePath={BASE}
        headers={list.headers}
        rows={ROWS}
        empty={list.empty}
        search={list.search}
        truncated={list.truncated}
        canWrite
        labelledBy="lista-titulo"
      />
    </ListScreen>
  );
}

const table = () => page.getByRole('table', { name: 'Autores', exact: true });
const bodyRows = () => table().element().querySelectorAll('tbody tr');

beforeEach(() => {
  navigation.set(BASE);
});

afterEach(() => {
  navigation.set('/');
});

describe('EntityTable no navegador', () => {
  it('com 30 autores a 1280 px, sem rolagem horizontal e com até duas linhas por célula', async () => {
    await renderInFrame(<Authors />);
    expect(bodyRows()).toHaveLength(25);
    await expect.element(page.getByRole('navigation', { name: 'Paginação' })).toBeVisible();
    await expect
      .element(table().getByRole('link', { name: `Editar ${LONG_NAME}` }))
      .toHaveAttribute('href', `${BASE}/1`);

    expect(pageOverflow()).toBe(0);
    expect(tableOverflow(table())).toBe(0);
    expect(cellsOverLines(table())).toEqual([]);
  });

  it('o seletor de tamanho fica na URL, e remontar mantém a mesma visão (#363)', async () => {
    const screen = await renderInFrame(<Authors />);
    (page.getByRole('combobox', { name: 'Itens por página' }).element() as HTMLElement).focus();
    await userEvent.keyboard('{ArrowDown}');
    await page.getByRole('option', { name: '10 / página' }).click();
    await expect.poll(() => navigation.search()).toBe('por-pagina=10');
    await expect.poll(() => bodyRows().length).toBe(10);

    await screen.unmount();
    await renderInFrame(<Authors />);
    expect(bodyRows()).toHaveLength(10);
    await expect
      .element(page.getByRole('status').filter({ hasText: /resultados?$/ }))
      .toHaveTextContent('30 resultados');
  });

  it.each(COLOR_SCHEMES)('paginada, sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Authors />);
    expect(await audit()).toEqual([]);
  });
});
