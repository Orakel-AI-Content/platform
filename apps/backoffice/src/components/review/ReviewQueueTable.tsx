'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import DataTable, { type ColumnDef, type Row } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { ROW_LINK_CLASS } from '@/components/shared/rowLink';
import { CONTENT_KIND_LABEL, formatDateTime } from '@/components/shared/siteLabels.ts';
import { NoWrap } from '@/components/shared/NoWrap';
import { Truncated } from '@/components/shared/Truncated';
import { useListTable } from '@/components/shared/useListTable';
import { StateTag } from '@/components/sites/SiteStatus';
import classNames from '@/components/ui/utils/classNames';
import type { ListConfig } from '@/components/shared/useListState.ts';
import type { ReviewQueueEntry } from '@/domain/reviews/reviews.ts';

const KINDS = Object.keys(CONTENT_KIND_LABEL) as ReviewQueueEntry['kind'][];

/** Busca por título, filtro por tipo, a mais antiga primeiro (a ordem do domínio, #74) (#365). */
const LIST: ListConfig = {
  filters: [{ column: 'kind', param: 'tipo', values: KINDS }],
  sortable: ['title', 'kind', 'version', 'pending', 'submittedAt'],
  defaultSort: { id: 'submittedAt', desc: false },
  pageSizes: [10, 25, 50, 100],
};

/** Ordena pelo texto exibido em pt-BR (rótulo do tipo, título), não pelo valor. */
function byText(text: (item: ReviewQueueEntry) => string) {
  return (a: Row<ReviewQueueEntry>, b: Row<ReviewQueueEntry>) =>
    text(a.original).localeCompare(text(b.original), 'pt-BR');
}

function columnsFor(siteId: string, timeZone: string): ColumnDef<ReviewQueueEntry>[] {
  return [
    {
      header: 'Título',
      accessorKey: 'title',
      meta: { fluid: true },
      sortFn: byText((item) => item.title),
      // A marca "Devolvido" fica fora do link: o nome acessível continua o título (#772).
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-2">
          <Link
            href={`/sites/${siteId}/revisao/${row.original.id}`}
            className={classNames(ROW_LINK_CLASS, 'min-w-0')}
          >
            <Truncated text={row.original.title} />
            <span className="sr-only"> (revisar)</span>
          </Link>
          {row.original.returned && (
            <StateTag color="bg-warning" className="shrink-0">
              Devolvido
            </StateTag>
          )}
        </span>
      ),
    },
    {
      header: 'Tipo',
      accessorKey: 'kind',
      meta: { hideBelow: 'md' },
      enableGlobalFilter: false,
      filterFn: 'equalsString',
      sortFn: byText((item) => CONTENT_KIND_LABEL[item.kind]),
      cell: ({ row }) => CONTENT_KIND_LABEL[row.original.kind],
    },
    {
      header: 'Versão',
      accessorKey: 'version',
      meta: { hideBelow: 'md' },
      enableGlobalFilter: false,
      sortFn: 'basic',
    },
    // Itens da revisão que não estão ok, contados como na tela de revisão (#772).
    {
      header: 'Pendências',
      accessorKey: 'pending',
      enableGlobalFilter: false,
      sortFn: 'basic',
      cell: ({ row }) => (row.original.pending === 0 ? 'Nenhuma' : row.original.pending),
    },
    // Instante do envio para revisão (#771); a data da versão nas anteriores à coluna.
    {
      header: 'Enviado em',
      accessorKey: 'submittedAt',
      enableGlobalFilter: false,
      sortFn: 'datetime',
      cell: ({ row }) => <NoWrap>{formatDateTime(row.original.submittedAt, timeZone)}</NoWrap>,
    },
  ];
}

/**
 * Fila de revisão do site (#74): conteúdos cuja versão mais recente está em revisão, da mais
 * antiga para a mais recente. Cada título leva à tela de revisão, com a marca "Devolvido" ao
 * lado quando volta de uma devolução, e "Pendências" conta o que não está ok (#772). No DataTable do template
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
  rows: ReviewQueueEntry[];
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
