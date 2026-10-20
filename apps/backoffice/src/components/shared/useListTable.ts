'use client';

import { useTable, type RowData } from '@tanstack/react-table';

import type { ColumnDef, DataTableProps, OnSortParam } from './DataTable.tsx';
import { dataTableFeatures } from './DataTable.tsx';
import { PAGE_SIZE, useListState, type ListConfig } from './useListState.ts';

// Linhas de uma lista filtrada no cliente para o DataTable (#361): busca, filtros e ordem do
// `useListState` (a URL) aplicados pelo TanStack às linhas carregadas, e a página cortada aqui.
// O DataTable continua manual, como no Ecme: recebe a página, o total e os handlers.

/** Props do DataTable que a lista não precisa montar. */
export type ListTableProps<T extends RowData> = Required<
  Pick<
    DataTableProps<T>,
    | 'data'
    | 'noData'
    | 'pageSizes'
    | 'pagingData'
    | 'sort'
    | 'onSort'
    | 'onPaginationChange'
    | 'onSelectChange'
  >
>;

/**
 * A lista declara colunas (as do DataTable: acessor, `filterFn`, `sortFn`,
 * `enableGlobalFilter`) e a `ListConfig`; recebe `list` (o `useListState`, para a toolbar),
 * `found` (o total filtrado) e `tableProps`, prontas para o DataTable. Página além da última
 * (a URL pode trazer qualquer número) mostra a última.
 */
export function useListTable<T extends RowData>({
  config,
  columns,
  data,
}: {
  config: ListConfig;
  columns: ColumnDef<T>[];
  data: T[];
}) {
  const list = useListState(config);
  const table = useTable({ features: dataTableFeatures, columns, data, ...list.table });
  const filtered = table.getPrePaginatedRowModel().rows;
  const found = filtered.length;
  const { page, pageSize, sort } = list.state;
  const current = Math.min(page, Math.max(Math.ceil(found / pageSize), 1));

  const tableProps: ListTableProps<T> = {
    data: filtered.slice((current - 1) * pageSize, current * pageSize).map((row) => row.original),
    noData: found === 0,
    pageSizes: [...(config.pageSizes ?? [PAGE_SIZE])],
    pagingData: { total: found, pageIndex: current, pageSize },
    sort: sort ? { order: sort.desc ? 'desc' : 'asc', key: sort.id } : { order: '', key: '' },
    onSort: ({ order, key }: OnSortParam) => {
      const next = order ? { id: String(key), desc: order === 'desc' } : config.defaultSort;
      if (next) list.setSort(next);
    },
    onPaginationChange: list.setPage,
    onSelectChange: list.setPageSize,
  };

  return { list, found, tableProps };
}
