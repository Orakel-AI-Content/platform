import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent, type Locator } from 'vitest/browser';

import { DataTableShowcase } from '@/app/(admin)/teste-de-componentes/data-table-showcase.tsx';

import {
  audit,
  COLOR_SCHEMES,
  setReducedMotion,
  setTheme,
  tabTo,
} from '../../../test/browser/a11y.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderUi } from '../../../test/browser/render.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// DataTable em Chromium (#459; da vitrine, #215, #361): a lista completa no padrão do template,
// calculada pelo `useListTable`, com busca, filtro, ordem, página e tamanho na URL (o roteador
// do Next em memória, `test/browser/navigation.ts`); remontar com a mesma URL mantém a visão,
// no lugar do recarregar do E2E. Lista vazia com a ação principal; busca sem resultado só com a
// mensagem; carregando, o esqueleto. A fixture é a seção da própria vitrine.

const PATH = '/teste-de-componentes';

const materias = () => page.getByRole('table', { name: 'Matérias', exact: true });

/** Texto do link principal de cada linha do corpo (a manchete, sem o resumo). */
const firstCells = (table: Locator) =>
  [...table.element().querySelectorAll('tbody tr')].map(
    (row) => row.querySelector('td a')?.textContent ?? row.textContent ?? '',
  );

/** A contagem de resultados (o `status` com "resultado"). */
const resultCount = () =>
  [...document.querySelectorAll('[role="status"]')]
    .map((element) => element.textContent ?? '')
    .find((text) => /resultado/.test(text));

const search = () => navigation.search();

beforeEach(() => {
  navigation.set(PATH);
});

afterEach(() => {
  navigation.set(PATH);
});

describe('DataTable no navegador', () => {
  it('pagina e ordena pela URL, por teclado, e remontar mantém a visão', async () => {
    const screen = await renderUi(<DataTableShowcase />);
    const nav = () => page.getByRole('navigation', { name: 'Paginação' }).first();
    const manchete = () => materias().getByRole('columnheader', { name: 'Manchete' });

    // Sem parâmetros: 25 por página, na ordem padrão (manchete crescente), com a contagem.
    expect(firstCells(materias())).toHaveLength(25);
    expect(firstCells(materias())[0]).toBe('Matéria 01');
    expect(resultCount()).toBe('32 resultados');
    const count = [...document.querySelectorAll('[role="status"]')].find((element) =>
      /resultado/.test(element.textContent ?? ''),
    )!;
    expect(count.classList.contains('tabular-nums')).toBe(true);
    await expect.element(manchete()).toHaveAttribute('aria-sort', 'ascending');
    await expect
      .element(materias().getByRole('columnheader', { name: 'Situação' }))
      .not.toHaveAttribute('aria-sort');

    await nav().getByRole('button', { name: 'Página 2' }).click();
    await expect.poll(search).toBe('pagina=2');
    await expect
      .poll(() => firstCells(materias()))
      .toEqual([...Array(7).keys()].map((i) => `Matéria ${26 + i}`));

    const sortButton = manchete().getByRole('button', { name: 'Manchete' });
    await tabTo(sortButton);
    await userEvent.keyboard('{Enter}');
    await expect.poll(search).toBe('pagina=2&ordem=-titulo');
    await expect.element(manchete()).toHaveAttribute('aria-sort', 'descending');
    await expect.poll(() => firstCells(materias())[0]).toBe('Matéria 07');

    // A URL é a fonte da visão: montar de novo com ela mostra a mesma página e ordem.
    await screen.unmount();
    await renderUi(<DataTableShowcase />);
    await expect.element(manchete()).toHaveAttribute('aria-sort', 'descending');
    await expect
      .element(nav().getByRole('button', { name: 'Página 2' }))
      .toHaveAttribute('aria-current', 'page');
    expect(firstCells(materias())[0]).toBe('Matéria 07');
  });

  it('o seletor grava ?por-pagina=, volta à página 1 e sobrevive à remontagem', async () => {
    navigation.set(`${PATH}?pagina=2`);
    const screen = await renderUi(<DataTableShowcase />);
    const select = page.getByRole('combobox', { name: 'Itens por página' }).first();

    (select.element() as HTMLElement).focus();
    await userEvent.keyboard('{ArrowDown}');
    await page.getByRole('option', { name: '10 / página' }).click();
    await expect.poll(search).toBe('por-pagina=10');
    await expect.poll(() => firstCells(materias())).toHaveLength(10);
    expect(firstCells(materias())[0]).toBe('Matéria 01');

    await screen.unmount();
    await renderUi(<DataTableShowcase />);
    expect(firstCells(materias())).toHaveLength(10);
    await expect.element(page.getByText('10 / página').first()).toBeVisible();
  });

  it('busca sem acento e filtro na URL; sem resultado, só a mensagem e um "Limpar filtros"', async () => {
    const screen = await renderUi(<DataTableShowcase />);
    const searchbox = () => page.getByRole('searchbox', { name: 'Buscar por manchete' });
    const clear = () => page.getByRole('button', { name: 'Limpar filtros' });

    expect(clear().elements()).toHaveLength(0);
    await userEvent.fill(searchbox(), 'materia 1');
    await expect.poll(search).toBe('q=materia+1');
    await expect.poll(resultCount).toBe('10 resultados');

    (page.getByLabelText('Situação').element() as HTMLElement).focus();
    await userEvent.keyboard('{ArrowDown}');
    await page.getByRole('option', { name: 'Em revisão' }).click();
    await expect.poll(search).toBe('q=materia+1&situacao=revisao');
    await expect
      .poll(() => firstCells(materias()))
      .toEqual(['Matéria 12', 'Matéria 15', 'Matéria 18']);

    // Remontar mantém busca e filtro (a URL é a fonte).
    await screen.unmount();
    await renderUi(<DataTableShowcase />);
    await expect.poll(resultCount).toBe('3 resultados');
    await expect.element(searchbox()).toHaveValue('materia 1');

    await userEvent.fill(searchbox(), 'nada por aqui');
    await expect.element(materias().getByText('Nenhuma matéria encontrada.')).toBeVisible();
    await expect.poll(resultCount).toBe('0 resultados');
    expect(materias().element().querySelectorAll('tbody button')).toHaveLength(0);
    expect(clear().elements()).toHaveLength(1);

    await clear().click();
    await expect.poll(navigation.get).toBe(PATH);
    await expect.poll(resultCount).toBe('32 resultados');
    expect(clear().elements()).toHaveLength(0);
    await expect.element(searchbox()).toHaveFocus();
  });

  it('toolbar em coluna abaixo de md e em linha a partir de md', async () => {
    await renderUi(<DataTableShowcase />);
    const toolbar = page.getByRole('search');
    const direction = () => getComputedStyle(toolbar.element()).flexDirection;

    await page.viewport(1280, 800);
    await expect.poll(direction).toBe('row');
    await page.viewport(600, 800);
    await expect.poll(direction).toBe('column');
  });

  it('lista vazia mostra a ação principal; carregando, o esqueleto com aria-busy', async () => {
    await renderUi(<DataTableShowcase />);

    await expect.element(page.getByText('Nenhum rascunho cadastrado.')).toBeVisible();
    // A ação do cabeçalho e a repetida no estado vazio, nos dois cartões: 3 no total.
    expect(page.getByRole('link', { name: 'Nova matéria' }).elements()).toHaveLength(3);

    const loading = page.getByRole('table', { name: 'Matérias carregando' });
    await expect.element(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading.element().querySelectorAll('tbody tr')).toHaveLength(10);
    await expect
      .element(page.elementLocator(loading.element().querySelector('tbody .skeleton')!))
      .toBeVisible();
  });

  it('a ação da linha é um link de ícone com dica, alcançado por Tab', async () => {
    await renderUi(<DataTableShowcase />);
    const row = page.elementLocator(materias().element().querySelector('tbody tr')!);
    const edit = row.getByRole('link', { name: 'Editar Matéria 01', exact: true });

    // Botão de ícone (#441): sem texto visível, o lápis aria-hidden e a dica no foco.
    await expect.element(edit).toHaveTextContent('');
    expect(edit.element().querySelectorAll('[aria-hidden="true"] svg')).toHaveLength(1);
    (row.getByRole('link', { name: 'Matéria 01', exact: true }).element() as HTMLElement).focus();
    await userEvent.keyboard('{Tab}');
    await expect.element(edit).toHaveFocus();
    await expect.element(page.getByRole('tooltip')).toHaveTextContent('Editar Matéria 01');
    expect(edit.element().getAttribute('href')).toBe('#vitrine-data-table');
  });
});

describe.each(COLOR_SCHEMES)('DataTable no navegador (%s)', (scheme) => {
  it.each(['?pagina=2&ordem=-visitas', '?q=nada+por+aqui&situacao=rascunho'])(
    'sem violação do axe com %s',
    async (query) => {
      await setTheme(scheme);
      await setReducedMotion('reduce');
      navigation.set(`${PATH}${query}`);
      const screen = await renderUi(<DataTableShowcase />);

      await expect.element(materias()).toBeVisible();
      expect(await audit(screen.container)).toEqual([]);
    },
  );
});
