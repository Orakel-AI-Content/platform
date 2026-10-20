// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ColumnDef } from './DataTable.tsx';
import { useListTable } from './useListTable.ts';
import type { ListConfig } from './useListState.ts';

// Hook de linhas das listas (#361): busca sem acento, filtro, ordem e página calculados no
// cliente a partir da URL, entregues no formato do DataTable.

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

// 30 itens: os dois primeiros com acento e tipos diferentes, o resto artigos numerados.
const ITEMS: Item[] = [
  { id: 1, title: 'Ação de graças', kind: 'article' },
  { id: 2, title: 'Quem somos', kind: 'page' },
  ...Array.from({ length: 28 }, (_, index) => ({
    id: index + 3,
    title: `Artigo ${String(index + 1).padStart(2, '0')}`,
    kind: 'article' as const,
  })),
];

const COLUMNS: ColumnDef<Item>[] = [
  { header: 'Título', accessorKey: 'title' },
  { header: 'Tipo', accessorKey: 'kind', filterFn: 'equalsString', enableGlobalFilter: false },
];

const CONFIG: ListConfig = {
  filters: [{ column: 'kind', param: 'tipo', values: ['article', 'page'] }],
  sortable: ['title'],
  defaultSort: { id: 'title', desc: false },
  pageSizes: [10, 25],
};

function renderList(query = '', config: ListConfig = CONFIG) {
  navigation.set(query);
  return renderHook(() => useListTable({ config, columns: COLUMNS, data: ITEMS }));
}

const titles = (rows: Item[]) => rows.map((item) => item.title);

describe('useListTable', () => {
  it('sem parâmetros: primeira página na ordem padrão, total de todas as linhas', () => {
    const { result } = renderList();
    const { tableProps, found } = result.current;

    expect(found).toBe(30);
    expect(tableProps.data).toHaveLength(25);
    // Ordem `alphanumeric` padrão do TanStack (a lista que quiser pt-BR declara `sortFn`).
    expect(tableProps.data[0]?.title).toBe('Artigo 01');
    expect(tableProps.pagingData).toEqual({ total: 30, pageIndex: 1, pageSize: 25 });
    expect(tableProps.sort).toEqual({ order: 'asc', key: 'title' });
    expect(tableProps.pageSizes).toEqual([10, 25]);
    expect(tableProps.noData).toBe(false);
  });

  it('busca ignora acentos e maiúsculas e o total é o filtrado', () => {
    const { result } = renderList('q=ACAO');

    expect(titles(result.current.tableProps.data)).toEqual(['Ação de graças']);
    expect(result.current.found).toBe(1);
    expect(result.current.tableProps.pagingData.total).toBe(1);
  });

  it('filtro por coluna e busca sem resultado (noData)', () => {
    expect(titles(renderList('tipo=page').result.current.tableProps.data)).toEqual(['Quem somos']);
    cleanup();

    const { result } = renderList('tipo=page&q=artigo');
    expect(result.current.found).toBe(0);
    expect(result.current.tableProps.noData).toBe(true);
    expect(result.current.tableProps.data).toEqual([]);
  });

  it('ordem decrescente da URL e página com o tamanho escolhido', () => {
    const { result } = renderList('ordem=-title&pagina=2&por-pagina=10');
    const { tableProps } = result.current;

    expect(tableProps.sort).toEqual({ order: 'desc', key: 'title' });
    expect(tableProps.pagingData).toEqual({ total: 30, pageIndex: 2, pageSize: 10 });
    // Decrescente: "Quem somos", "Ação de graças", "Artigo 28"…; a página 2 vai do 20 ao 11.
    expect(tableProps.data[0]?.title).toBe('Artigo 20');
    expect(tableProps.data.at(-1)?.title).toBe('Artigo 11');
  });

  it('página além da última mostra a última', () => {
    const { result } = renderList('pagina=9&por-pagina=10');

    expect(result.current.tableProps.pagingData.pageIndex).toBe(3);
    expect(result.current.tableProps.data).toHaveLength(10);
  });

  it('os handlers gravam ordem, página e tamanho na URL', () => {
    const { result } = renderList();

    act(() => result.current.tableProps.onSort({ order: 'desc', key: 'title' }));
    expect(navigation.get()).toBe('ordem=-title');

    act(() => result.current.tableProps.onPaginationChange(2));
    expect(navigation.get()).toBe('ordem=-title&pagina=2');

    act(() => result.current.tableProps.onSelectChange(10));
    expect(navigation.get()).toBe('ordem=-title&por-pagina=10');

    // Sem ordem (o terceiro clique do DataTable) volta à ordem padrão.
    act(() => result.current.tableProps.onSort({ order: '', key: '' }));
    expect(navigation.get()).toBe('por-pagina=10');
  });

  it('lista sem pageSizes oferece só o tamanho padrão', () => {
    const { result } = renderList('', { filters: [], sortable: [] });

    expect(result.current.tableProps.pageSizes).toEqual([25]);
    expect(result.current.tableProps.sort).toEqual({ order: '', key: '' });
    expect(result.current.tableProps.data[0]?.id).toBe(1);
  });
});
