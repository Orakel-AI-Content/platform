// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import Link from 'next/link';
import { afterEach, describe, expect, it } from 'vitest';

import DataTable from './DataTable.tsx';
import { EmptyState, NoResults } from './EmptyState.tsx';

// Estado vazio das listas (#87, #361): lista vazia com a mensagem e a ação principal (só quando
// a página a passa); sem resultado, só a mensagem dentro da tabela, sem ação de limpar.

afterEach(cleanup);

describe('estado vazio', () => {
  it('sem ação mostra só a mensagem', () => {
    render(<EmptyState>Nenhum autor cadastrado.</EmptyState>);

    expect(screen.getByText('Nenhum autor cadastrado.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('com ação mostra a mensagem e a ação', () => {
    render(
      <EmptyState action={<Link href="/sites/exemplo-a/autores/novo">Criar autor</Link>}>
        Nenhum autor cadastrado.
      </EmptyState>,
    );

    expect(screen.getByText('Nenhum autor cadastrado.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Criar autor' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/autores/novo',
    );
  });
});

describe('sem resultado (#361)', () => {
  it('no noData do DataTable: mensagem e ilustração decorativa, nenhuma ação', () => {
    const { container } = render(
      <DataTable
        aria-label="Autores"
        columns={[{ header: 'Nome', accessorKey: 'name' }]}
        data={[]}
        noData
        customNoDataIcon={<NoResults>Nenhum autor encontrado.</NoResults>}
        pagingData={{ total: 0, pageIndex: 1, pageSize: 25 }}
      />,
    );

    expect(screen.getByRole('table', { name: 'Autores' })).toBeTruthy();
    expect(screen.getByText('Nenhum autor encontrado.')).toBeTruthy();
    expect(container.querySelector('tbody svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('tbody button, tbody a')).toBeNull();
  });
});
