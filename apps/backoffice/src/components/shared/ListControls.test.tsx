// @vitest-environment happy-dom
import { createColumnHelper, useTable } from '@tanstack/react-table';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Table from '@/components/ui/Table';

import { ListPagination, ListToolbar, SortableHead } from './ListControls.tsx';
import { listFeatures, useListState, type ListConfig } from './useListState.ts';

const { THead, TBody, Tr, Td } = Table;

// Controles de lista (#106): busca sem acentos, filtros, cabeçalho ordenável com aria-sort e
// paginação, ligados a uma lista de teste com o estado na URL (router.replace simulado).

const navigation = vi.hoisted(() => {
  let search = '';
  const listeners = new Set<() => void>();
  return {
    replace: vi.fn<(url: string) => void>(),
    get: () => search,
    set: (next: string) => {
      search = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    usePathname: () => '/lista',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(navigation.subscribe, navigation.get)),
    useRouter: () => ({
      replace: (url: string) => {
        navigation.replace(url);
        navigation.set(url.split('?')[1] ?? '');
      },
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  navigation.set('');
});

type Item = { id: number; title: string; kind: 'article' | 'page' };

// 30 itens: 2 páginas de 25. Os títulos com acento conferem a busca.
const items: Item[] = [
  { id: 1, title: 'Ação de graças', kind: 'article' },
  { id: 2, title: 'Quem somos', kind: 'page' },
  ...Array.from({ length: 28 }, (_, index) => ({
    id: index + 3,
    title: `Guia ${String(index + 3).padStart(2, '0')}`,
    kind: 'article' as const,
  })),
];

const config: ListConfig = {
  filters: [{ column: 'kind', param: 'tipo', values: ['article', 'page'] }],
  sortable: ['id', 'title'],
  defaultSort: { id: 'id', desc: false },
};

const column = createColumnHelper<typeof listFeatures, Item>();
const columns = column.columns([
  column.accessor('id', { header: 'ID', enableGlobalFilter: false }),
  column.accessor('title', { header: 'Título' }),
  column.accessor('kind', {
    header: 'Tipo',
    enableGlobalFilter: false,
    enableSorting: false,
    filterFn: 'equalsString',
  }),
]);

function TestList() {
  const list = useListState(config);
  const table = useTable({ features: listFeatures, columns, data: items, ...list.table });
  return (
    <>
      <ListToolbar
        search={list.state.search}
        searchLabel="Buscar por título"
        onSearchChange={list.setSearch}
        filters={[
          {
            column: 'kind',
            label: 'Tipo',
            value: list.state.filters.kind,
            options: [
              { value: 'article', label: 'Artigo' },
              { value: 'page', label: 'Página' },
            ],
          },
        ]}
        onFilterChange={list.setFilter}
        onClear={list.clearFilters}
      />
      <Table>
        <THead>
          <Tr>
            {table.getHeaderGroups()[0]?.headers.map((header) => (
              <SortableHead
                key={header.id}
                scope="col"
                label={String(header.column.columnDef.header)}
                direction={header.column.getIsSorted()}
                onToggle={() => header.column.toggleSorting()}
              />
            ))}
          </Tr>
        </THead>
        <TBody>
          {table.getRowModel().rows.map((row) => (
            <Tr key={row.id}>
              <Td>{row.original.id}</Td>
              <Td>{row.original.title}</Td>
              <Td>{row.original.kind}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <ListPagination
        total={table.getPrePaginatedRowModel().rows.length}
        page={list.state.page}
        pageCount={table.getPageCount()}
        onPageChange={list.setPage}
      />
    </>
  );
}

// O filtro é o combobox do react-select: abre com a seta e escolhe a opção pelo nome.
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  screen.getByRole('combobox', { name: label }).focus();
  await user.keyboard('{ArrowDown}');
  await user.click(screen.getByRole('option', { name: option }));
}

const filterValue = (label: string) =>
  screen.getByRole('combobox', { name: label }).closest('.select')?.textContent;

const titles = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1]?.textContent);

describe('ListToolbar', () => {
  it('a busca ignora maiúsculas e acentos e grava com replace', async () => {
    const user = userEvent.setup();
    render(<TestList />);

    await user.type(screen.getByLabelText('Buscar por título'), 'ACAO');

    expect(titles()).toEqual(['Ação de graças']);
    expect(screen.getByRole('status').textContent).toBe('1 resultado');
    expect(navigation.replace).toHaveBeenLastCalledWith('/lista?q=ACAO');
  });

  it('filtro combina com a busca e "Limpar filtros" tira os dois e volta o foco à busca', async () => {
    const user = userEvent.setup();
    render(<TestList />);
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();

    await choose(user, 'Tipo', 'Página');
    expect(titles()).toEqual(['Quem somos']);
    await user.type(screen.getByLabelText('Buscar por título'), 'guia');
    expect(screen.getByRole('status').textContent).toBe('0 resultados');

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    expect(navigation.get()).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('Buscar por título').value).toBe('');
    expect(filterValue('Tipo')).toBe('Todos');
    expect(screen.getByRole('status').textContent).toBe('30 resultados');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Buscar por título')),
    );
  });

  it('abrir a URL restaura busca, filtro, ordem e página', () => {
    act(() => navigation.set('q=guia&tipo=article&ordem=-title&pagina=2'));
    render(<TestList />);

    expect(screen.getByLabelText<HTMLInputElement>('Buscar por título').value).toBe('guia');
    expect(filterValue('Tipo')).toBe('Artigo');
    expect(screen.getByRole('columnheader', { name: /Título/ }).getAttribute('aria-sort')).toBe(
      'descending',
    );
    expect(screen.getByText('Página 2 de 2')).toBeDefined();
    expect(titles()).toEqual(['Guia 05', 'Guia 04', 'Guia 03']);
  });
});

describe('ListToolbar: layout do template (#361)', () => {
  it('em coluna abaixo de md, em linha a partir de md, sem min-w fixo', () => {
    render(
      <ListToolbar
        search=""
        searchLabel="Buscar por título"
        onSearchChange={() => {}}
        filters={[{ column: 'kind', label: 'Tipo', value: 'page', options: [] }]}
        onClear={() => {}}
      />,
    );

    const form = screen.getByRole('search');
    expect(form.className.split(' ')).toEqual(
      expect.arrayContaining(['flex-col', 'md:flex-row', 'md:items-center', 'md:justify-between']),
    );
    expect(form.outerHTML).not.toMatch(/min-w-/);
    expect(within(form).getByRole('button', { name: 'Limpar filtros' })).toBeTruthy();
  });

  it('sem filtro ativo nem busca, não mostra "Limpar filtros"', () => {
    render(
      <ListToolbar
        search=""
        searchLabel="Buscar por nome"
        onSearchChange={() => {}}
        onClear={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
  });
});

describe('SortableHead', () => {
  it('alterna o sentido com clique e teclado e expõe aria-sort', async () => {
    const user = userEvent.setup();
    render(<TestList />);
    const header = () => screen.getByRole('columnheader', { name: /Título/ });
    expect(header().getAttribute('aria-sort')).toBe('none');
    expect(screen.getByRole('columnheader', { name: /ID/ }).getAttribute('aria-sort')).toBe(
      'ascending',
    );

    await user.click(within(header()).getByRole('button'));
    expect(header().getAttribute('aria-sort')).toBe('ascending');
    expect(within(header()).getByRole('button', { name: /ordem crescente/ })).toBeDefined();
    expect(navigation.get()).toBe('ordem=title');

    within(header()).getByRole('button').focus();
    await user.keyboard('{Enter}');
    expect(header().getAttribute('aria-sort')).toBe('descending');
    await user.keyboard(' ');
    expect(header().getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getByRole('columnheader', { name: /ID/ }).getAttribute('aria-sort')).toBe('none');
  });
});

describe('ListPagination', () => {
  it('mostra a contagem e desabilita Página anterior na primeira página e Próxima página na última', async () => {
    const user = userEvent.setup();
    render(<TestList />);
    const previous = () => screen.getByRole('button', { name: 'Página anterior' });
    const next = () => screen.getByRole('button', { name: 'Próxima página' });
    const pagination = () => screen.getByRole('navigation', { name: 'Paginação' });

    expect(screen.getByRole('status').textContent).toBe('30 resultados');
    expect(screen.getAllByRole('row')).toHaveLength(26);
    expect(previous()).toHaveProperty('disabled', true);
    expect(next()).toHaveProperty('disabled', false);
    expect(
      within(pagination()).getByRole('button', { name: 'Página 1' }).getAttribute('aria-current'),
    ).toBe('page');

    await user.click(next());

    expect(screen.getByText('Página 2 de 2')).toBeDefined();
    expect(screen.getAllByRole('row')).toHaveLength(6);
    expect(previous()).toHaveProperty('disabled', false);
    expect(next()).toHaveProperty('disabled', true);
    expect(
      within(pagination()).getByRole('button', { name: 'Página 2' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(navigation.get()).toBe('pagina=2');

    await user.click(within(pagination()).getByRole('button', { name: 'Página 1' }));
    expect(navigation.get()).toBe('');
  });

  it('volta à página 1 quando a busca ou o filtro mudam', async () => {
    const user = userEvent.setup();
    act(() => navigation.set('pagina=2'));
    render(<TestList />);

    await user.type(screen.getByLabelText('Buscar por título'), 'g');
    expect(navigation.get()).toBe('q=g');
    expect(screen.getByText('Página 1 de 2')).toBeDefined();

    act(() => navigation.set('pagina=2'));
    await choose(user, 'Tipo', 'Artigo');
    expect(navigation.get()).toBe('tipo=article');
  });

  it('formata a contagem em pt-BR', () => {
    render(<ListPagination total={2000} page={1} pageCount={80} onPageChange={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('2.000 resultados');
    expect(screen.getByText('Página 1 de 80')).toBeDefined();
  });
});
