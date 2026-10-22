// @vitest-environment happy-dom
import { createColumnHelper, useTable } from '@tanstack/react-table';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Table from '@/components/ui/Table';

import { resultCount } from './DataTable.tsx';
import { ListToolbar } from './ListControls.tsx';
import { listFeatures, useListState, type ListConfig } from './useListState.ts';

const { THead, TBody, Tr, Th, Td } = Table;

// Toolbar da lista (#106): busca sem acentos e filtros, ligados a uma lista de teste com o
// estado na URL (router.replace simulado). Ordem e paginação do DataTable têm testes próprios
// (`useListTable.test.ts`, `DataTable.test.tsx`).

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
              <Th key={header.id} scope="col">
                {String(header.column.columnDef.header)}
              </Th>
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
      <p role="status">{resultCount(table.getPrePaginatedRowModel().rows.length)}</p>
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
    // Segunda página da ordem decrescente por título.
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

  it('a busca mostra a lupa como sufixo decorativo, sem mudar o nome acessível (#442)', () => {
    render(
      <ListToolbar
        search=""
        searchLabel="Buscar por nome"
        onSearchChange={() => {}}
        onClear={() => {}}
      />,
    );

    const input = screen.getByRole('searchbox', { name: 'Buscar por nome' });
    const suffix = input.parentElement?.querySelector('.input-suffix-end');
    const icon = suffix?.querySelector('svg');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('class')).toContain('text-lg');
    expect(screen.getByText('Buscar por nome')).toBeTruthy();
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
