'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import DataTable, { type ColumnDef, type Row } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { ROW_LINK_CLASS } from '@/components/shared/rowLink';
import { CONTENT_KIND_LABEL, formatDateTime } from '@/components/shared/siteLabels.ts';
import { Truncated } from '@/components/shared/Truncated';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState.ts';
import type { ReviewQueueItem } from '@/domain/content/contents.ts';

const KINDS = Object.keys(CONTENT_KIND_LABEL) as ReviewQueueItem['kind'][];

/** Busca por título, filtro por tipo, a mais antiga primeiro (a ordem do domínio, #74) (#365). */
const LIST: ListConfig = {
  filters: [{ column: 'kind', param: 'tipo', values: KINDS }],
  sortable: ['title', 'kind', 'version', 'updatedAt'],
  defaultSort: { id: 'updatedAt', desc: false },
  pageSizes: [10, 25, 50, 100],
};

/** Ordena pelo texto exibido em pt-BR (rótulo do tipo, título), não pelo valor. */
function byText(text: (item: ReviewQueueItem) => string) {
  return (a: Row<ReviewQueueItem>, b: Row<ReviewQueueItem>) =>
    text(a.original).localeCompare(text(b.original), 'pt-BR');
}

function columnsFor(siteId: string, timeZone: string): ColumnDef<ReviewQueueItem>[] {
  return [
    {
      header: 'Título',
      accessorKey: 'title',
      sortFn: byText((item) => item.title),
      cell: ({ row }) => (
        <Link href={`/sites/${siteId}/revisao/${row.original.id}`} className={ROW_LINK_CLASS}>
          <Truncated text={row.original.title} className="max-w-xs" />
          <span className="sr-only"> (revisar)</span>
        </Link>
      ),
    },
    {
      header: 'Tipo',
      accessorKey: 'kind',
      enableGlobalFilter: false,
      filterFn: 'equalsString',
      sortFn: byText((item) => CONTENT_KIND_LABEL[item.kind]),
      cell: ({ row }) => CONTENT_KIND_LABEL[row.original.kind],
    },
    { header: 'Versão', accessorKey: 'version', enableGlobalFilter: false, sortFn: 'basic' },
    // Data da versão enviada: a data do envio não é guardada (#72).
    {
      header: 'Enviado em',
      accessorKey: 'updatedAt',
      enableGlobalFilter: false,
      sortFn: 'datetime',
      cell: ({ row }) => formatDateTime(row.original.updatedAt, timeZone),
    },
  ];
}

/**
 * Fila de revisão do site (#74): conteúdos cuja versão mais recente está em revisão, da mais
 * antiga para a mais recente. Cada título leva à tela de revisão. No DataTable do template
 * (#365): busca por título, filtro por tipo, ordem e paginação no cliente com o estado na URL;
 * toolbar e tabela vão no cartão da página, abaixo do `ListHeader`.
 */
export function ReviewQueueTable({
  siteId,
  timeZone,
  rows,
  labelledBy,
}: {
  siteId: string;
  /** Fuso do site (`SiteSummary.timeZone`): as datas aparecem nele. */
  timeZone: string;
  rows: ReviewQueueItem[];
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
}) {
  const columns = useMemo(() => columnsFor(siteId, timeZone), [siteId, timeZone]);
  const { list, tableProps } = useListTable({ config: LIST, columns, data: rows });
  if (rows.length === 0) {
    return <EmptyState>Nenhum conteúdo aguardando revisão.</EmptyState>;
  }
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
            options: KINDS.map((kind) => ({ value: kind, label: CONTENT_KIND_LABEL[kind] })),
          },
        ]}
        onFilterChange={list.setFilter}
        onClear={list.clearFilters}
      />
      <DataTable
        compact
        aria-labelledby={labelledBy}
        instanceId="review-queue-table"
        columns={columns}
        customNoDataIcon={<NoResults>Nenhum conteúdo encontrado.</NoResults>}
        {...tableProps}
      />
    </>
  );
}
