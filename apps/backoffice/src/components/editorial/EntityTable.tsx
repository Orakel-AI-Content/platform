'use client';

import { useMemo, type ReactNode } from 'react';

import DataTable, { type ColumnDef } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { Truncated } from '@/components/shared/Truncated';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState.ts';
import ButtonLink from '@/components/ui/Button/ButtonLink';

/** Linha de uma lista de entidades: o servidor já formata as células como texto. */
export type EntityRow = { id: number; name: string; cells: string[] };

/** Busca por nome e paginação (#108): o rótulo da busca e a mensagem sem resultado. */
export type EntitySearch = { label: string; notFound: string };

/** Só busca (`q`), página e tamanho: sem filtros, sem ordenação, na ordem do servidor. */
const LIST: ListConfig = { filters: [], sortable: [], pageSizes: [10, 25, 50, 100] };

const NONE: readonly number[] = [];

function columnsFor(
  basePath: string,
  headers: readonly [string, ...string[]],
  truncated: readonly number[],
  canWrite: boolean,
): ColumnDef<EntityRow>[] {
  const [nameHeader, ...rest] = headers;
  const columns: ColumnDef<EntityRow>[] = [
    // O nome, nunca cortado, fica com a maior parte da largura (o DataTable dá a cada célula a
    // largura da coluna, 150 px por padrão, e a tabela distribui a sobra na mesma proporção).
    { header: nameHeader, accessorKey: 'name', enableSorting: false, size: 300 },
    ...rest.map((header, index): ColumnDef<EntityRow> => ({
      id: `cell-${index}`,
      header,
      accessorFn: (row) => row.cells[index] ?? '',
      enableGlobalFilter: false,
      enableSorting: false,
      cell: ({ row }) => {
        const text = row.original.cells[index] ?? '';
        return truncated.includes(index) ? <Truncated text={text} className="max-w-xs" /> : text;
      },
    })),
  ];
  if (!canWrite) return columns;
  return [
    ...columns,
    {
      id: 'actions',
      header: () => <span className="sr-only">Ações</span>,
      enableSorting: false,
      // Na largura do botão: o resto da tabela vai para o nome e as demais células.
      size: 1,
      cell: ({ row }) => (
        <ButtonLink href={`${basePath}/${row.original.id}`} size="xs">
          Editar
          <span className="sr-only"> {row.original.name}</span>
        </ButtonLink>
      ),
    },
  ];
}

/**
 * Lista de autores, taxonomias ou menus no DataTable do template (#363): busca pelo nome,
 * paginação e tamanho com o estado na URL (#108); toolbar e tabela vão no cartão da página,
 * abaixo do `ListHeader`. Editar só aparece com `canWrite` (content.write, decidido no
 * servidor); criar é a ação do cabeçalho da página, repetida no estado vazio. O domínio
 * confere de novo ao gravar.
 */
export function EntityTable({
  basePath,
  headers,
  rows,
  empty,
  search,
  truncated = NONE,
  canWrite = false,
  emptyAction,
  labelledBy,
}: {
  /** `/sites/<site>/autores`: a edição é `<basePath>/<id>`. */
  basePath: string;
  /** Rótulo do nome e das demais células, na ordem. */
  headers: readonly [string, ...string[]];
  rows: EntityRow[];
  /** Lista vazia: nada cadastrado. */
  empty: string;
  search: EntitySearch;
  /** Índices de `cells` cortados numa linha, com o texto inteiro em `title`. */
  truncated?: readonly number[];
  canWrite?: boolean;
  /** Ação principal da tela (criar), repetida no estado vazio; só com permissão. */
  emptyAction?: ReactNode;
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
}) {
  const columns = useMemo(
    () => columnsFor(basePath, headers, truncated, canWrite),
    [basePath, headers, truncated, canWrite],
  );
  const { list, tableProps } = useListTable({ config: LIST, columns, data: rows });
  if (rows.length === 0) {
    return <EmptyState action={emptyAction}>{empty}</EmptyState>;
  }
  return (
    <>
      <ListToolbar
        search={list.state.search}
        searchLabel={search.label}
        onSearchChange={list.setSearch}
        onClear={list.clearFilters}
      />
      <DataTable
        compact
        aria-labelledby={labelledBy}
        instanceId="entity-table"
        columns={columns}
        customNoDataIcon={<NoResults>{search.notFound}</NoResults>}
        {...tableProps}
      />
    </>
  );
}
