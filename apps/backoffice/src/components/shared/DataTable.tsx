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
// - `ref` só com o `DataTableResetHandle` (o Ecme aceitava também o da <table>, que não usava);
// - as features incluem as de `listFeatures` (busca global, `sortFns` e o filtro
//   `equalsString`), exportadas como `dataTableFeatures`: a mesma `ColumnDef` serve ao
//   `useListTable`, que filtra, ordena e corta, e ao DataTable, que só desenha (#361);
// - contagem "N resultados" em `role="status"` no rodapé, junto da paginação e do seletor, e o
//   rodapé quebra linha em tela estreita (#361).
// Acrescentado (#495): `rowSelectable` restringe a seleção por linha (o `enableRowSelection` do
// TanStack) e a linha que não pode ser escolhida fica sem caixa; `checkboxLabel` dá nome a cada
// caixa. Com a seleção controlada (`checkboxChecked`), o "indeterminado" do cabeçalho sai dela,
// não do estado interno, e o cabeçalho fica desabilitado quando nenhuma linha da página pode
// ser escolhida. As caixas leem a seleção por contexto, com as colunas estáveis: no Ecme, o
// `checkboxChecked` novo a cada clique recriava as colunas, remontava as células e tirava o
// foco da caixa marcada pelo teclado.
// Acrescentado (#587): com `rowUnselectableReason`, a linha que `rowSelectable` nega desenha a
// caixa `disabled`, com o motivo na dica (`Tooltip`, para quem passa o ponteiro) e num texto
// oculto ligado à caixa por `aria-describedby` (para o leitor de tela, que não abre a dica de um
// controle desabilitado). Sem a prop, a linha continua sem caixa. A caixa desabilitada não entra
// no "selecionar todas" nem no indeterminado: quem decide é o `getCanSelect` do TanStack.
// Acrescentado (#585): a coluna com `meta: { fluid: true }` ocupa a largura que sobra na tabela
// (`w-full max-w-0` no Th e no Td, sem a largura do `getSize()`), e o `Truncated` dentro dela só
// corta quando falta espaço. As outras colunas ficam como no Ecme.
// Acrescentado (#589): a coluna com `meta: { hideBelow: 'md' }` fica oculta (Th e Td) abaixo de
// `md`, com `hidden md:table-cell`, para a coluna principal e o status caberem a 390 px sem
// rolagem. Por classe, não por `columnVisibility`: o HTML é o mesmo em toda largura. Abaixo de
// `md` também, as células têm `max-md:px-2` (a partir dele, o respiro da Table: `px-6`, ou o
// `px-3` do `compact`) e a largura do `getSize()` (150 px por padrão no TanStack) só vale a
// partir de `md`, pela variável `--col-w`: a 390 px, os 48 px de respiro e os 150 px por coluna
// não deixavam espaço para o título.
'use client';

import { createContext, use, useId, useImperativeHandle, useMemo, useState } from 'react';
import Table from '@/components/ui/Table';
import Pagination from '@/components/ui/Pagination';
import Select from '@/components/ui/Select';
import Checkbox from '@/components/ui/Checkbox';
import { Tooltip } from '@/components/ui/Tooltip';
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
  filterFn_equalsString,
  flexRender,
  functionalUpdate,
  globalFilteringFeature,
  sortFns,
} from '@tanstack/react-table';
import type {
  ColumnDef as BaseColumnDef,
  Row as BaseRow,
  CellContext as BaseCellContext,
  CellData,
  RowData,
  SortingState,
  TableFeatures,
  Table as TanstackTable,
} from '@tanstack/react-table';
import type { TableProps } from '@/components/ui/Table';
import type { SkeletonProps } from '@/components/ui/Skeleton';
import type { CheckboxProps } from '@/components/ui/Checkbox';
import type { ChangeEvent, CSSProperties, ReactNode, Ref } from 'react';

// Ordenação e paginação são controladas por quem usa (manualSorting / manualPagination); as
// features registradas cobrem as APIs usadas no render e as do cálculo do `useListTable`.
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns,
  filterFns: { equalsString: filterFn_equalsString },
});

export type DataTableFeatures = typeof dataTableFeatures;

// Os parâmetros repetem os da declaração do TanStack, como a fusão de interfaces exige.
/* eslint-disable @typescript-eslint/no-unused-vars */
declare module '@tanstack/table-core' {
  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData = CellData,
  > {
    /** Coluna principal da lista: ocupa a largura que sobra, e o texto longo corta nela (#585). */
    fluid?: boolean;
    /** Abaixo desta largura, a coluna (cabeçalho e células) fica oculta (#589). */
    hideBelow?: 'md';
  }
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/** Classe da coluna fluida no Th e no Td: `max-w-0` deixa o `truncate` seguir a coluna. */
export const FLUID_CELL_CLASS = 'w-full max-w-0';

/**
 * Classes do Th e do Td de uma coluna, pelo `meta`: respiro menor abaixo de `md`, fluida (ou com
 * a largura do `--col-w` a partir de `md`) e oculta abaixo de `md` (#589).
 */
function columnClass(meta: { fluid?: boolean; hideBelow?: 'md' } | undefined, cell = false) {
  return classNames(
    'max-md:px-2',
    meta?.fluid ? FLUID_CELL_CLASS : cell && 'md:w-(--col-w)',
    meta?.hideBelow === 'md' && 'hidden md:table-cell',
  );
}

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
  /** Quais linhas podem ser escolhidas; as outras ficam sem caixa. Sem ela, todas. */
  rowSelectable?: (row: T) => boolean;
  /**
   * Por que a linha negada por `rowSelectable` não pode ser escolhida: com ela, a linha ganha a
   * caixa desabilitada com esse motivo na dica e no `aria-describedby`.
   */
  rowUnselectableReason?: (row: T) => string;
  /** Nome da caixa de cada linha ("Selecionar <título>"); sem ele, "Selecionar linha". */
  checkboxLabel?: (row: T) => string;
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

/** Seleção controlada do DataTable, lida pelas caixas do cabeçalho e de cada linha. */
type Selection<T extends RowData> = {
  checkboxChecked?: (row: T) => boolean;
  indeterminateCheckboxChecked?: (rows: Row<T>[]) => boolean;
  checkboxLabel?: (row: T) => string;
  rowUnselectableReason?: (row: T) => string;
  onRowChange: (checked: boolean, row: T) => void;
  onAllChange: (checked: boolean, rows: Row<T>[]) => void;
};

const SelectionContext = createContext<Selection<RowData> | null>(null);

function useSelection<T extends RowData>(): Selection<T> {
  const selection = use(SelectionContext);
  if (selection === null) throw new Error('Caixa de seleção fora do DataTable');
  return selection as unknown as Selection<T>;
}

function SelectAllCheckbox<T extends RowData>({
  table,
}: {
  table: TanstackTable<DataTableFeatures, T>;
}) {
  const { checkboxChecked, indeterminateCheckboxChecked, onAllChange } = useSelection<T>();
  const rows = table.getRowModel().rows;
  const selectableRows = rows.filter((row) => row.getCanSelect());
  const checkedRows = checkboxChecked
    ? selectableRows.filter((row) => checkboxChecked(row.original)).length
    : 0;
  const indeterminate = checkboxChecked
    ? checkedRows > 0 && checkedRows < selectableRows.length
    : table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected();
  return (
    <IndeterminateCheckbox
      aria-label="Selecionar todas as linhas"
      checked={
        indeterminateCheckboxChecked
          ? indeterminateCheckboxChecked(rows)
          : table.getIsAllRowsSelected()
      }
      disabled={selectableRows.length === 0}
      indeterminate={indeterminate}
      onChange={table.getToggleAllRowsSelectedHandler()}
      onIndeterminateCheckBoxChange={(e) => onAllChange(e.target.checked, rows)}
    />
  );
}

/**
 * O filho que o `Tooltip` clona: o `aria-describedby` que ele injeta ao abrir fica de fora (o
 * motivo já está no texto oculto), como no `IconButton`.
 */
function UnselectableCheckboxControl({
  describedBy,
  ...props
}: CheckboxProps & { describedBy: string }) {
  return <Checkbox {...props} aria-describedby={describedBy} />;
}

/** Caixa da linha que não pode ser escolhida, com o motivo (`rowUnselectableReason`). */
function UnselectableRowCheckbox({ label, reason }: { label: string; reason: string }) {
  const reasonId = useId();
  return (
    <>
      <Tooltip title={reason} wrapperClass="inline-flex">
        <UnselectableCheckboxControl
          className="mb-0"
          aria-label={label}
          describedBy={reasonId}
          checked={false}
          disabled
        />
      </Tooltip>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </>
  );
}

function SelectRowCheckbox<T extends RowData>({ row }: { row: Row<T> }) {
  const { checkboxChecked, checkboxLabel, rowUnselectableReason, onRowChange } = useSelection<T>();
  const label = checkboxLabel ? checkboxLabel(row.original) : 'Selecionar linha';
  if (!row.getCanSelect()) {
    return rowUnselectableReason ? (
      <UnselectableRowCheckbox label={label} reason={rowUnselectableReason(row.original)} />
    ) : null;
  }
  return (
    <IndeterminateCheckbox
      aria-label={label}
      checked={checkboxChecked ? checkboxChecked(row.original) : row.getIsSelected()}
      indeterminate={row.getIsSomeSelected()}
      onChange={row.getToggleSelectedHandler()}
      onCheckBoxChange={(e) => onRowChange(e.target.checked, row.original)}
    />
  );
}

const count = new Intl.NumberFormat('pt-BR');

/** "1 resultado", "1.250 resultados". */
export function resultCount(total: number): string {
  return total === 1 ? '1 resultado' : `${count.format(total)} resultados`;
}

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
    rowSelectable,
    rowUnselectableReason,
    checkboxLabel,
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
      // As caixas leem a seleção pelo contexto: com ela controlada (`checkboxChecked` muda a
      // cada clique), colunas recriadas remontariam as células e o foco do teclado se perderia.
      return [
        {
          id: 'select',
          maxSize: 50,
          header: ({ table }) => <SelectAllCheckbox<T> table={table} />,
          cell: ({ row }) => <SelectRowCheckbox<T> row={row} />,
        },
        ...columns,
      ];
    }
    return columns;
  }, [columnsProp, selectable]);

  const selection: Selection<T> = {
    checkboxChecked,
    indeterminateCheckboxChecked,
    checkboxLabel,
    rowUnselectableReason,
    onRowChange: handleCheckBoxChange,
    onAllChange: handleIndeterminateCheckBoxChange,
  };

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns: finalColumns,
    manualPagination: true,
    manualSorting: true,
    enableRowSelection: rowSelectable ? (row) => rowSelectable(row.original) : true,
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
    <SelectionContext value={selection as unknown as Selection<RowData>}>
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
                      className={columnClass(header.column.columnDef.meta)}
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
                              className={columnClass(cell.column.columnDef.meta, true)}
                              style={
                                cell.column.columnDef.meta?.fluid
                                  ? undefined
                                  : ({ '--col-w': `${cell.column.getSize()}px` } as CSSProperties)
                              }
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
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <Pagination
            pageSize={pageSize}
            currentPage={pageIndex}
            total={total}
            onChange={handlePaginationChange}
          />
          <div className="flex items-center gap-3">
            {/* Sempre na página, para o leitor de tela anunciar a troca; vazio no esqueleto. */}
            <p role="status" className="text-sm tabular-nums">
              {loading && data.length === 0 ? '' : resultCount(total)}
            </p>
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
        </div>
      </Loading>
    </SelectionContext>
  );
}

export default DataTable;
