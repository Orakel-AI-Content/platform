// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Table } from './index.tsx';

// Table do Ecme (#213): classes das variantes, cabeçalho com `scope` e `aria-sort` no Th.

afterEach(cleanup);

const { THead, TBody, TFoot, Tr, Th, Td, Sorter } = Table;

describe('Table', () => {
  it('padrão: table-default com hover, dentro do contêiner que rola', () => {
    render(
      <Table aria-label="Sites">
        <TBody>
          <Tr>
            <Td>Exemplo</Td>
          </Tr>
        </TBody>
      </Table>,
    );

    const table = screen.getByRole('table', { name: 'Sites' });
    expect(table.className).toBe('table-default table-hover');
    expect(table.parentElement?.className).toBe('overflow-x-auto');
  });

  it('compact, cellBorder, sem hover nem rolagem e className do chamador', () => {
    render(
      <Table compact cellBorder hoverable={false} overflow={false} className="mt-4">
        <TBody />
      </Table>,
    );

    const table = screen.getByRole('table');
    expect(table.className).toBe('table-default table-compact table-border mt-4');
    expect(table.parentElement?.className).toBe('');
  });

  it('asElement troca o elemento e a classe para table-flex', () => {
    const { container } = render(<Table asElement="div" />);

    expect(container.querySelector('.overflow-x-auto > div')?.className).toBe(
      'table-flex table-hover',
    );
  });

  it('Th tem scope="col" por padrão e aceita scope="row"', () => {
    render(
      <Table>
        <THead>
          <Tr>
            <Th>Nome</Th>
            <Th>Status</Th>
          </Tr>
        </THead>
        <TBody>
          <Tr>
            <Th scope="row">Exemplo</Th>
            <Td>Publicado</Td>
          </Tr>
        </TBody>
        <TFoot>
          <Tr>
            <Td colSpan={2}>1 site</Td>
          </Tr>
        </TFoot>
      </Table>,
    );

    expect(screen.getByRole('columnheader', { name: 'Nome' }).getAttribute('scope')).toBe('col');
    expect(screen.getByRole('rowheader', { name: 'Exemplo' }).getAttribute('scope')).toBe('row');
    expect(screen.getByRole('cell', { name: '1 site' }).getAttribute('colspan')).toBe('2');
  });

  it.each([
    ['asc', 'ascending'],
    ['desc', 'descending'],
    ['none', 'none'],
  ] as const)('Th com sort="%s" expõe aria-sort="%s"', (sort, ariaSort) => {
    render(
      <Table>
        <THead>
          <Tr>
            <Th sort={sort}>Título</Th>
          </Tr>
        </THead>
      </Table>,
    );

    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe(ariaSort);
  });

  it('Th sem sort não tem aria-sort', () => {
    render(
      <Table>
        <THead>
          <Tr>
            <Th>Título</Th>
          </Tr>
        </THead>
      </Table>,
    );

    expect(screen.getByRole('columnheader').hasAttribute('aria-sort')).toBe(false);
  });

  it('Sorter é decorativo: ícone neutro, ascendente e descendente em primary, nada sem sort', () => {
    const { container, rerender } = render(<Sorter sort />);
    const sorter = () => container.firstElementChild!;

    expect(sorter().getAttribute('aria-hidden')).toBe('true');
    expect(sorter().querySelector('svg')?.getAttribute('class')).toBeNull();

    rerender(<Sorter sort="asc" />);
    expect(sorter().querySelector('svg')?.getAttribute('class')).toBe('text-primary');

    rerender(<Sorter sort="desc" className="ml-1" />);
    expect(sorter().className).toBe('inline-flex ml-1');
    expect(sorter().querySelector('svg')?.getAttribute('class')).toBe('text-primary');

    rerender(<Sorter />);
    expect(sorter().querySelector('svg')).toBeNull();
  });
});
