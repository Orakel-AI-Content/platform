// Ecme v1.3.10 (e5f9a1d): src/components/shared/DataTable.tsx
// Adaptado (#215):
// - cabeçalho ordenável é um <button> dentro do Th, que recebe `sort` (→ `aria-sort`); o Ecme
//   usava um <div onClick>, fora do Tab;
// - `sort` opcional controla a ordenação (a lista na URL, `useListState`): recarregar mostra a
//   seta certa. Sem ele, a ordem fica no estado local, como no Ecme. `onSort` sai do
//   `onSortingChange`, não de um efeito, para não disparar na montagem;
// - textos em pt-BR ("Nenhum dado encontrado", "N / página"), `aria-label` no seletor de
//   tamanho e nas caixas de seleção; o `IndeterminateCheckbox` usa o `indeterminate` do
//   Checkbox portado (#208), que já liga a propriedade nativa;
// - a tabela fica com `aria-busy` enquanto carrega (o esqueleto é `aria-hidden`, #206);
// - `ref` só com o `DataTableResetHandle` (o Ecme aceitava também o da <table>, que não usava).
'use client';

import { useImperativeHandle, useMemo, useState } from 'react';
import Table from '@/components/ui/Table';
import Pagination from '@/components/ui/Pagination';
import Select from '@/components/ui/Select';
import Checkbox from '@/components/ui/Checkbox';
import classNames from '@/components/ui/utils/classNames';
import TableRowSkeleton from './loaders/TableRowSkeleton';
import Loading from './Loading';
import FileNotFound from '@/assets/svg/FileNotFound';
import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  rowSelectionFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  flexRender,
  functionalUpdate,
} from '@tanstack/react-table';
import type {
  ColumnDef as BaseColumnDef,
  Row as BaseRow,
  CellContext as BaseCellContext,
  RowData,
  SortingState,
} from '@tanstack/react-table';
import type { TableProps } from '@/components/ui/Table';
import type { SkeletonProps } from '@/components/ui/Skeleton';
import type { CheckboxProps } from '@/components/ui/Checkbox';
import type { ChangeEvent, ReactNode, Ref } from 'react';

// Ordenação e paginação são controladas por quem usa (manualSorting / manualPagination); as
// features registradas cobrem as APIs usadas no render.
const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});

type DataTableFeatures = typeof dataTableFeatures;

export type ColumnDef<T extends RowData, TValue = unknown> = BaseColumnDef<
  DataTableFeatures,
  T,
  TValue
>;
export type Row<T extends RowData> = BaseRow<DataTableFeatures, T>;
export type CellContext<T extends RowData, TValue = unknown> = BaseCellContext<
  DataTableFeatures,
  T,
  TValue
>;

export type OnSortParam = { order: 'asc' | 'desc' | ''; key: string | number };

export type DataTableResetHandle = {
  resetSorting: () => void;
  resetSelected: () => void;
};

export type DataTableProps<T extends RowData> = {
  columns: ColumnDef<T>[];
  customNoDataIcon?: ReactNode;
  data?: T[];
  loading?: boolean;
  noData?: boolean;
  instanceId?: string;
  onCheckBoxChange?: (checked: boolean, row: T) => void;
  onIndeterminateCheckBoxChange?: (checked: boolean, rows: Row<T>[]) => void;
  onPaginationChange?: (page: number) => void;
  onSelectChange?: (num: number) => void;
  onSort?: (sort: OnSortParam) => void;
  pageSizes?: number[];
  selectable?: boolean;
  skeletonAvatarColumns?: number[];
  skeletonAvatarProps?: SkeletonProps;
  /** Ordenação controlada (ex.: a da URL); sem ela, fica no estado local. */
  sort?: OnSortParam;
  pagingData?: {
    total: number;
    pageIndex: number;
    pageSize: number;
  };
  checkboxChecked?: (row: T) => boolean;
  indeterminateCheckboxChecked?: (row: Row<T>[]) => boolean;
  ref?: Ref<DataTableResetHandle>;
} & Omit<TableProps, 'ref'>;

type CheckBoxChangeEvent = ChangeEvent<HTMLInputElement>;

interface IndeterminateCheckboxProps extends Omit<CheckboxProps, 'onChange'> {
  onChange: (event: CheckBoxChangeEvent) => void;
  indeterminate: boolean;
  onCheckBoxChange?: (event: CheckBoxChangeEvent) => void;
  onIndeterminateCheckBoxChange?: (event: CheckBoxChangeEvent) => void;
}

const { Tr, Th, Td, THead, TBody, Sorter } = Table;

const IndeterminateCheckbox = (props: IndeterminateCheckboxProps) => {
  const { indeterminate, onChange, onCheckBoxChange, onIndeterminateCheckBoxChange, ...rest } =
    props;

  const handleChange = (e: CheckBoxChangeEvent) => {
    onChange(e);
    onCheckBoxChange?.(e);
    onIndeterminateCheckBoxChange?.(e);
  };

  return (
    <Checkbox
      className="mb-0"
      indeterminate={!rest.checked && indeterminate}
      onChange={(_, e) => handleChange(e)}
      {...rest}
    />
  );
};

/** `OnSortParam` → `SortingState` do TanStack (ordem vazia: sem ordenação). */
function toSorting(sort: OnSortParam): SortingState {
  return sort.order ? [{ id: String(sort.key), desc: sort.order === 'desc' }] : [];
}

function DataTable<T extends RowData>(props: DataTableProps<T>) {
  const {
    skeletonAvatarColumns,
    columns: columnsProp = [],
    data = [],
    customNoDataIcon,
    loading,
    noData,
    onCheckBoxChange,
    onIndeterminateCheckBoxChange,
    onPaginationChange,
    onSelectChange,
    onSort,
    pageSizes = [10, 25, 50, 100],
    selectable = false,
    skeletonAvatarProps,
    sort,
    pagingData = {
      total: 0,
      pageIndex: 1,
      pageSize: 10,
    },
    checkboxChecked,
    indeterminateCheckboxChecked,
    instanceId = 'data-table',
    ref,
    ...rest
  } = props;

  const { pageSize, pageIndex, total } = pagingData;

  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const sorting = sort ? toSorting(sort) : localSorting;

  const pageSizeOption = useMemo(
    () =>
      pageSizes.map((number) => ({
        value: number,
        label: `${number} / página`,
      })),
    [pageSizes],
  );

  const handleIndeterminateCheckBoxChange = (checked: boolean, rows: Row<T>[]) => {
    if (!loading) {
      onIndeterminateCheckBoxChange?.(checked, rows);
    }
  };

  const handleCheckBoxChange = (checked: boolean, row: T) => {
    if (!loading) {
      onCheckBoxChange?.(checked, row);
    }
  };

  const finalColumns: ColumnDef<T>[] = useMemo(() => {
    const columns = columnsProp;

    if (selectable) {
      return [
        {
          id: 'select',
          maxSize: 50,
          header: ({ table }) => (
            <IndeterminateCheckbox
              aria-label="Selecionar todas as linhas"
              checked={
                indeterminateCheckboxChecked
                  ? indeterminateCheckboxChecked(table.getRowModel().rows)
                  : table.getIsAllRowsSelected()
              }
              indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
              onChange={table.getToggleAllRowsSelectedHandler()}
              onIndeterminateCheckBoxChange={(e) => {
                handleIndeterminateCheckBoxChange(e.target.checked, table.getRowModel().rows);
              }}
            />
          ),
          cell: ({ row }) => (
            <IndeterminateCheckbox
              aria-label="Selecionar linha"
              checked={checkboxChecked ? checkboxChecked(row.original) : row.getIsSelected()}
              disabled={!row.getCanSelect()}
              indeterminate={row.getIsSomeSelected()}
              onChange={row.getToggleSelectedHandler()}
              onCheckBoxChange={(e) => handleCheckBoxChange(e.target.checked, row.original)}
            />
          ),
        },
        ...columns,
      ];
    }
    return columns;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsProp, selectable, loading, checkboxChecked]);

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns: finalColumns,
    manualPagination: true,
    manualSorting: true,
    onSortingChange: (updater) => {
      const next = functionalUpdate(updater, sorting);
      if (!sort) setLocalSorting(next);
      const first = next[0];
      onSort?.({ order: first ? (first.desc ? 'desc' : 'asc') : '', key: first?.id ?? '' });
    },
    state: {
      sorting,
    },
  });

  const resetSorting = () => {
    table.resetSorting();
  };

  const resetSelected = () => {
    table.resetRowSelection(true);
  };

  useImperativeHandle(ref, () => ({
    resetSorting,
    resetSelected,
  }));

  const handlePaginationChange = (page: number) => {
    if (!loading) {
      resetSelected();
      onPaginationChange?.(page);
    }
  };

  const handleSelectChange = (value?: number) => {
    if (!loading) {
      onSelectChange?.(Number(value));
    }
  };

  return (
    <Loading loading={Boolean(loading && data.length !== 0)} type="cover">
      <Table aria-busy={loading || undefined} {...rest}>
        <THead>
          {table.getHeaderGroups().map((headerGroup) => (
            <Tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const content = header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext());
                return (
                  <Th
                    key={header.id}
                    colSpan={header.colSpan}
                    sort={canSort ? sorted || 'none' : undefined}
                  >
                    {canSort && !header.isPlaceholder ? (
                      <button
                        type="button"
                        className={classNames(
                          'inline-flex min-h-6 cursor-pointer select-none items-center gap-1 uppercase',
                          loading && 'pointer-events-none',
                        )}
                        disabled={loading}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {content}
                        <Sorter sort={sorted || true} />
                      </button>
                    ) : (
                      content
                    )}
                  </Th>
                );
              })}
            </Tr>
          ))}
        </THead>
        {loading && data.length === 0 ? (
          <TableRowSkeleton
            columns={finalColumns.length}
            rows={pagingData.pageSize}
            avatarInColumns={skeletonAvatarColumns}
            avatarProps={skeletonAvatarProps}
          />
        ) : (
          <TBody>
            {noData ? (
              <Tr>
                <Td className="hover:bg-transparent" colSpan={finalColumns.length}>
                  <div className="flex flex-col items-center gap-4">
                    {customNoDataIcon ? (
                      customNoDataIcon
                    ) : (
                      <>
                        <FileNotFound />
                        <span className="font-semibold">Nenhum dado encontrado!</span>
                      </>
                    )}
                  </div>
                </Td>
              </Tr>
            ) : (
              table
                .getRowModel()
                .rows.slice(0, pageSize)
                .map((row) => {
                  return (
                    <Tr key={row.id}>
                      {row.getVisibleCells().map((cell) => {
                        return (
                          <Td
                            key={cell.id}
                            style={{
                              width: cell.column.getSize(),
                            }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </Td>
                        );
                      })}
                    </Tr>
                  );
                })
            )}
          </TBody>
        )}
      </Table>
      <div className="flex items-center justify-between mt-4">
        <Pagination
          pageSize={pageSize}
          currentPage={pageIndex}
          total={total}
          onChange={handlePaginationChange}
        />
        <div style={{ minWidth: 130 }}>
          <Select
            instanceId={instanceId}
            aria-label="Itens por página"
            size="sm"
            menuPlacement="top"
            isSearchable={false}
            value={pageSizeOption.filter((option) => option.value === pageSize)}
            options={pageSizeOption}
            onChange={(option) => handleSelectChange(option?.value)}
          />
        </div>
      </div>
    </Loading>
  );
}

export default DataTable;
