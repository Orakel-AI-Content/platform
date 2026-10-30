import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  setReducedMotion,
  setTheme,
  tabTo,
} from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { Card } from '../Card';
import { Table, type ThSort } from './index.tsx';

// Table em Chromium (#459; da vitrine, #213): cabeçalho ordenável com scope e aria-sort no
// <th>, alternado pelo teclado; cabeçalho de linha com scope="row".

const ARTIGOS = [
  { titulo: 'Guia de jardinagem', status: 'Publicado' },
  { titulo: 'Análise do mercado', status: 'Rascunho' },
  { titulo: 'Receita de pão', status: 'Em revisão' },
];

/** Próxima ordenação do cabeçalho: sem ordem → ascendente → descendente → ascendente. */
const NEXT_SORT: Record<ThSort, ThSort> = { none: 'asc', asc: 'desc', desc: 'asc' };

function Tables() {
  const [ordem, setOrdem] = useState<ThSort>('none');
  return (
    <section aria-label="Table" className="space-y-3">
      <Card>
        <Table aria-label="Artigos">
          <Table.THead>
            <Table.Tr>
              <Table.Th sort={ordem}>
                <button
                  type="button"
                  className="inline-flex min-h-6 items-center gap-1 uppercase"
                  onClick={() => setOrdem(NEXT_SORT[ordem])}
                >
                  Título
                  <Table.Sorter sort={ordem === 'none' ? true : ordem} />
                </button>
              </Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.THead>
          <Table.TBody>
            {[...ARTIGOS]
              .sort((a, b) =>
                ordem === 'none'
                  ? 0
                  : (ordem === 'asc' ? 1 : -1) * a.titulo.localeCompare(b.titulo, 'pt-BR'),
              )
              .map((artigo) => (
                <Table.Tr key={artigo.titulo}>
                  <Table.Td>{artigo.titulo}</Table.Td>
                  <Table.Td>{artigo.status}</Table.Td>
                </Table.Tr>
              ))}
          </Table.TBody>
          <Table.TFoot>
            <Table.Tr>
              <Table.Td colSpan={2}>3 artigos</Table.Td>
            </Table.Tr>
          </Table.TFoot>
        </Table>
      </Card>
      <Card>
        <Table aria-label="Sites compactos" compact cellBorder hoverable={false}>
          <Table.THead>
            <Table.Tr>
              <Table.Th>Site</Table.Th>
              <Table.Th>Artigos</Table.Th>
            </Table.Tr>
          </Table.THead>
          <Table.TBody>
            <Table.Tr>
              <Table.Th scope="row">Exemplo A</Table.Th>
              <Table.Td>12</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Th scope="row">Receitas da casa</Table.Th>
              <Table.Td>48</Table.Td>
            </Table.Tr>
          </Table.TBody>
        </Table>
      </Card>
    </section>
  );
}

describe('Table no navegador', () => {
  it('cabeçalho com scope e aria-sort que alterna pelo teclado', async () => {
    const screen = await renderUi(<Tables />);
    const table = screen.getByRole('table', { name: 'Artigos' });
    const header = table.getByRole('columnheader', { name: 'Título' });
    const firstCell = () => table.element().querySelector('tbody td')?.textContent;

    await expect.element(header).toHaveAttribute('scope', 'col');
    await expect.element(header).toHaveAttribute('aria-sort', 'none');
    await expect
      .element(table.getByRole('columnheader', { name: 'Status' }))
      .not.toHaveAttribute('aria-sort');
    await expect
      .element(
        screen
          .getByRole('table', { name: 'Sites compactos' })
          .getByRole('rowheader', { name: 'Exemplo A' }),
      )
      .toHaveAttribute('scope', 'row');

    const sortButton = header.getByRole('button', { name: 'Título' });
    await tabTo(sortButton);
    await userEvent.keyboard('{Enter}');
    await expect.element(header).toHaveAttribute('aria-sort', 'ascending');
    expect(firstCell()).toBe('Análise do mercado');

    await userEvent.keyboard(' ');
    await expect.element(header).toHaveAttribute('aria-sort', 'descending');
    expect(firstCell()).toBe('Receita de pão');
    await expect.element(sortButton).toHaveFocus();
  });
});

describe.each(COLOR_SCHEMES)('Table no navegador (%s)', (scheme) => {
  it('ordenada sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderUi(<Tables />);

    await screen.getByRole('button', { name: 'Título', exact: true }).click();
    await expect
      .element(screen.getByRole('columnheader', { name: 'Título' }))
      .toHaveAttribute('aria-sort', 'ascending');
    expect(await audit(screen.container)).toEqual([]);
  });
});
