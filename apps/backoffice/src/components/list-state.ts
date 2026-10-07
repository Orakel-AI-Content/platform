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

/** Itens por página de toda lista filtrada (sem seletor: decisão da #35). */
export const PAGE_SIZE = 25;

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

/** Filtro de uma coluna: o parâmetro da URL e os valores aceitos (o resto é ignorado). */
export type ListFilterConfig = { column: string; param: string; values: readonly string[] };

export type ListConfig = {
  filters: readonly ListFilterConfig[];
  /** Colunas que aceitam ordenação; `ordem` fora delas cai na padrão. */
  sortable: readonly string[];
  defaultSort: ColumnSort;
};

export type ListState = {
  search: string;
  /** Valor de cada filtro ativo, pela coluna. */
  filters: Record<string, string>;
  sort: ColumnSort;
  /** Página a partir de 1. */
  page: number;
};

export type ListPatch = {
  search?: string;
  /** `undefined` (ou vazio) remove o filtro da coluna. */
  filters?: Record<string, string | undefined>;
  sort?: ColumnSort;
  page?: number;
};

const SEARCH = 'q';
const SORT = 'ordem';
const PAGE = 'pagina';

/** Estado da lista a partir dos `searchParams`; parâmetro inválido cai no padrão. */
export function parseListState(params: URLSearchParams, config: ListConfig): ListState {
  const filters: Record<string, string> = {};
  for (const filter of config.filters) {
    const value = params.get(filter.param);
    if (value !== null && filter.values.includes(value)) filters[filter.column] = value;
  }
  const sortParam = params.get(SORT) ?? '';
  const desc = sortParam.startsWith('-');
  const sortColumn = desc ? sortParam.slice(1) : sortParam;
  const sort = config.sortable.includes(sortColumn)
    ? { id: sortColumn, desc }
    : { ...config.defaultSort };
  const page = Number(params.get(PAGE));
  return {
    search: params.get(SEARCH) ?? '',
    filters,
    sort,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/**
 * Query string com a mudança aplicada; os demais parâmetros da URL ficam. Valor padrão sai
 * do endereço, e mudar a busca ou um filtro volta à página 1.
 */
export function listStateQuery(params: URLSearchParams, config: ListConfig, patch: ListPatch) {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | undefined) => {
    if (value === undefined || value === '') next.delete(key);
    else next.set(key, value);
  };
  if (patch.search !== undefined) set(SEARCH, patch.search);
  for (const [column, value] of Object.entries(patch.filters ?? {})) {
    const filter = config.filters.find((candidate) => candidate.column === column);
    if (filter)
      set(filter.param, value !== undefined && filter.values.includes(value) ? value : '');
  }
  if (patch.sort !== undefined) {
    const { id, desc } = patch.sort;
    const isDefault = id === config.defaultSort.id && desc === config.defaultSort.desc;
    set(SORT, isDefault ? undefined : `${desc ? '-' : ''}${id}`);
  }
  if (patch.page !== undefined) set(PAGE, patch.page > 1 ? String(patch.page) : undefined);
  else if (patch.search !== undefined || patch.filters !== undefined) next.delete(PAGE);
  return next.toString();
}

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
  const sorting: SortingState = [state.sort];
  const pagination: PaginationState = { pageIndex: state.page - 1, pageSize: PAGE_SIZE };

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
      onSortingChange: (updater: Updater<SortingState>) =>
        update({ sort: functionalUpdate(updater, sorting)[0] ?? config.defaultSort }),
      onPaginationChange: (updater: Updater<PaginationState>) =>
        update({ page: functionalUpdate(updater, pagination).pageIndex + 1 }),
      globalFilterFn: searchFilterFn,
      autoResetPageIndex: false,
      enableSortingRemoval: false,
    },
  };
}
