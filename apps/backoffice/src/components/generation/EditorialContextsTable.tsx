'use client';

import { useMemo, type ReactNode } from 'react';

import DataTable, { type ColumnDef } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { formatDateTime } from '@/components/shared/siteLabels.ts';
import { Truncated } from '@/components/shared/Truncated';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState.ts';
import type { EditorialContext } from '@/domain/generation/editorial-contexts.ts';

/** Busca pelo texto e pelo autor, a versão mais recente primeiro (a ordem do domínio). */
const LIST: ListConfig = {
  filters: [],
  sortable: ['version', 'createdAt'],
  defaultSort: { id: 'version', desc: true },
  pageSizes: [10, 25, 50, 100],
};

function columnsFor(timeZone: string): ColumnDef<EditorialContext>[] {
  return [
    {
      header: 'Versão',
      accessorKey: 'version',
      enableGlobalFilter: false,
      cell: ({ row }) => `v${row.original.version}`,
    },
    {
      header: 'Texto',
      accessorKey: 'body',
      enableSorting: false,
      cell: ({ row }) => <Truncated text={row.original.body} className="max-w-md" />,
    },
    {
      header: 'Criada por',
      accessorKey: 'createdBy',
      enableSorting: false,
    },
    {
      header: 'Criada em',
      accessorKey: 'createdAt',
      enableGlobalFilter: false,
      sortFn: 'datetime',
      cell: ({ row }) => formatDateTime(row.original.createdAt, timeZone),
    },
  ];
}

/**
 * Versões do contexto editorial do site (RN-GEN-05), só leitura: versão, trecho do texto,
 * quem criou e quando, no fuso do site. No DataTable do template, como a lista de pendências
 * (#365): busca, ordem e paginação no cliente com o estado na URL. Sem versões, o estado vazio
 * com a ação de criar, quando quem pede pode.
 */
export function EditorialContextsTable({
  timeZone,
  rows,
  labelledBy,
  emptyAction,
}: {
  /** Fuso do site (`SiteSummary.timeZone`): as datas aparecem nele. */
  timeZone: string;
  rows: EditorialContext[];
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
  /** Ação de criar a primeira versão, só com permissão. */
  emptyAction?: ReactNode;
}) {
  const columns = useMemo(() => columnsFor(timeZone), [timeZone]);
  const { list, tableProps } = useListTable({ config: LIST, columns, data: rows });
  if (rows.length === 0) {
    return <EmptyState action={emptyAction}>Nenhum contexto editorial salvo.</EmptyState>;
  }
  return (
    <>
      <ListToolbar
        search={list.state.search}
        searchLabel="Buscar no texto ou por autor"
        onSearchChange={list.setSearch}
        filters={[]}
        onFilterChange={list.setFilter}
        onClear={list.clearFilters}
      />
      <DataTable
        compact
        aria-labelledby={labelledBy}
        instanceId="editorial-contexts-table"
        columns={columns}
        customNoDataIcon={<NoResults>Nenhuma versão encontrada.</NoResults>}
        {...tableProps}
      />
    </>
  );
}
