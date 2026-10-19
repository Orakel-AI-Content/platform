'use client';

import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  functionalUpdate,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  type ColumnFiltersState,
  type ColumnSort,
  type PaginationState,
  type Row,
  type RowData,
  type SortingState,
  type Updater,
} from '@tanstack/react-table';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { listStateQuery, parseListState, type ListConfig, type ListPatch } from './listQuery.ts';

/** Texto para comparar na busca: sem acentos (NFD sem as marcas) e em minúsculas. */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Busca da lista: contém o texto, ignorando maiúsculas e acentos. */
export function searchFilterFn<TData extends RowData>(
  row: Row<typeof listFeatures, TData>,
  columnId: string,
  value: unknown,
): boolean {
  return normalizeText(String(row.getValue(columnId) ?? '')).includes(normalizeText(String(value)));
}

/**
 * Features das listas filtradas no cliente (TanStack Table 9): busca global, filtros por
 * coluna (igualdade), ordenação e paginação. O estado vem de `useListState`.
 */
export const listFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { equalsString: filterFn_equalsString },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

// Tipos e leitura da URL num módulo sem `'use client'` (`listQuery.ts`): a página do servidor
// também lê `q` e `pagina` (Mídia, #186), e o Next não deixa o servidor chamar função cliente.
export {
  listStateQuery,
  PAGE_SIZE,
  parseListState,
  type ListConfig,
  type ListFilterConfig,
  type ListPatch,
  type ListState,
} from './listQuery.ts';

/**
 * Estado de uma lista filtrada guardado na URL: a URL é a única fonte (abrir o endereço
 * restaura a lista) e cada mudança usa `router.replace`, que não cria entrada no histórico
 * a cada tecla da busca. `table` vai direto para o `useTable` com `listFeatures`.
 */
export function useListState(config: ListConfig) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = params.toString();
  const state = useMemo(() => parseListState(new URLSearchParams(query), config), [query, config]);

  // Última query pedida: o `router.replace` chega à URL depois, e duas mudanças seguidas
  // (filtro e logo a busca) partiriam da mesma query antiga, e a segunda apagaria a primeira.
  const latest = useRef(query);
  useEffect(() => {
    latest.current = query;
  }, [query]);

  const update = useCallback(
    (patch: ListPatch) => {
      const next = listStateQuery(new URLSearchParams(latest.current), config, patch);
      latest.current = next;
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [config, router, pathname],
  );

  const columnFilters: ColumnFiltersState = Object.entries(state.filters).map(([id, value]) => ({
    id,
    value,
  }));
  const sorting: SortingState = state.sort ? [state.sort] : [];
  const pagination: PaginationState = { pageIndex: state.page - 1, pageSize: state.pageSize };

  return {
    state,
    setSearch: (search: string) => update({ search }),
    setFilter: (column: string, value: string | undefined) =>
      update({ filters: { [column]: value } }),
    /** Limpa a busca e os filtros; a ordem fica. */
    clearFilters: () =>
      update({
        search: '',
        filters: Object.fromEntries(config.filters.map((filter) => [filter.column, undefined])),
      }),
    setPage: (page: number) => update({ page }),
    setSort: (sort: ColumnSort) => update({ sort }),
    setPageSize: (pageSize: number) => update({ pageSize }),
    table: {
      state: { globalFilter: state.search, columnFilters, sorting, pagination },
      onGlobalFilterChange: (updater: Updater<unknown>) => {
        const next = functionalUpdate(updater, state.search);
        update({ search: typeof next === 'string' ? next : '' });
      },
      onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => {
        const next = functionalUpdate(updater, columnFilters);
        update({
          filters: Object.fromEntries(
            config.filters.map(({ column }) => {
              const value = next.find((filter) => filter.id === column)?.value;
              return [column, typeof value === 'string' ? value : undefined];
            }),
          ),
        });
      },
      onSortingChange: (updater: Updater<SortingState>) => {
        const sort = functionalUpdate(updater, sorting)[0] ?? config.defaultSort;
        if (sort) update({ sort });
      },
      onPaginationChange: (updater: Updater<PaginationState>) =>
        update({ page: functionalUpdate(updater, pagination).pageIndex + 1 }),
      globalFilterFn: searchFilterFn,
      autoResetPageIndex: false,
      enableSortingRemoval: false,
    },
  };
}
