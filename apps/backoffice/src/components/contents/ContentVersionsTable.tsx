'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import DataTable, { type ColumnDef, type Row } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { ROW_LINK_CLASS } from '@/components/shared/rowLink';
import {
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_TAG,
  formatDateTime,
} from '@/components/shared/siteLabels.ts';
import { NoWrap } from '@/components/shared/NoWrap';
import { Truncated } from '@/components/shared/Truncated';
import { TwoLines } from '@/components/shared/TwoLines';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState.ts';
import { StateTag } from '@/components/sites/SiteStatus';
import type { ContentListItem } from '@/domain/content/contents.ts';

/** Linha da tela de versões: só o que a tabela mostra (sem os dados da versão). */
export type ContentVersionRow = {
  version: number;
  status: ContentListItem['status'];
  title: string;
  createdAt: Date;
  /** E-mail de quem criou a versão (`generator` no gerador); nulo nas versões antigas (#748). */
  createdBy: string | null;
  /** Quem aprovou a versão e quando (`reviews`); nula sem aprovação. */
  approval: { reviewer: string; approvedAt: Date } | null;
};

const STATUSES = Object.keys(CONTENT_STATUS_LABEL) as ContentVersionRow['status'][];

/** Busca pelo título, filtro por status, da mais recente à primeira (#366, #588). */
const LIST: ListConfig = {
  filters: [{ column: 'status', param: 'status', values: STATUSES }],
  sortable: ['version', 'status', 'createdAt'],
  defaultSort: { id: 'version', desc: true },
  pageSizes: [10, 25, 50, 100],
};

/** Ordena pelo texto exibido em pt-BR (o rótulo do status), não pelo valor. */
function byText(text: (row: ContentVersionRow) => string) {
  return (a: Row<ContentVersionRow>, b: Row<ContentVersionRow>) =>
    text(a.original).localeCompare(text(b.original), 'pt-BR');
}

// Três colunas que cabem no cartão a 1440 px (#588): o título vai sob a versão e a aprovação
// sob o status, como secundárias do `TwoLines`.
function columnsFor(
  siteId: string,
  contentId: number,
  timeZone: string,
): ColumnDef<ContentVersionRow>[] {
  return [
    {
      header: 'Versão',
      id: 'version',
      // A busca procura no título; a ordem é pelo número da versão.
      accessorFn: (row) => row.title,
      meta: { fluid: true },
      sortFn: (a, b) => a.original.version - b.original.version,
      // O acessor é texto, e o TanStack começaria crescente: o padrão (decrescente) seria lido como
      // fora do ciclo e o primeiro clique voltaria a ele. Começando decrescente, o clique inverte.
      sortDescFirst: true,
      cell: ({ row }) => (
        <TwoLines secondary={<Truncated text={row.original.title} />}>
          <Link
            href={`/sites/${siteId}/conteudos/${contentId}/versoes/${row.original.version}`}
            className={ROW_LINK_CLASS}
          >
            Versão {row.original.version}
          </Link>
        </TwoLines>
      ),
    },
    // A tag e, embaixo, quem aprovou e quando; sem aprovação, só a tag.
    {
      header: 'Status',
      accessorKey: 'status',
      enableGlobalFilter: false,
      filterFn: 'equalsString',
      sortFn: byText((row) => CONTENT_STATUS_LABEL[row.status]),
      cell: ({ row }) => {
        const { status, approval } = row.original;
        return (
          <TwoLines
            secondary={
              approval === null ? undefined : (
                <NoWrap>
                  {approval.reviewer} · {formatDateTime(approval.approvedAt, timeZone)}
                </NoWrap>
              )
            }
          >
            <StateTag color={CONTENT_STATUS_TAG[status]}>{CONTENT_STATUS_LABEL[status]}</StateTag>
          </TwoLines>
        );
      },
    },
    {
      header: 'Gravada em',
      accessorKey: 'createdAt',
      enableGlobalFilter: false,
      sortFn: 'datetime',
      // Quem criou a versão vai sob a data; "—" nas anteriores à autoria (#748).
      cell: ({ row }) => (
        <TwoLines secondary={<Truncated text={row.original.createdBy ?? '—'} />}>
          <NoWrap>{formatDateTime(row.original.createdAt, timeZone)}</NoWrap>
        </TwoLines>
      ),
    },
  ];
}

/**
 * Versões de um conteúdo, cada uma com link para lê-la. No DataTable do template (#366): busca
 * pelo título, filtro por status, ordem (da mais recente à primeira, por padrão) e paginação no
 * cliente com o estado na URL; toolbar e tabela vão no cartão da página, abaixo do
 * `ListHeader`. Sem versões, o estado vazio.
 */
export function ContentVersionsTable({
  siteId,
  contentId,
  timeZone,
  rows,
  labelledBy,
}: {
  siteId: string;
  contentId: number;
  /** Fuso do site (`SiteSummary.timeZone`): as datas aparecem nele. */
  timeZone: string;
  rows: ContentVersionRow[];
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
}) {
  const columns = useMemo(
    () => columnsFor(siteId, contentId, timeZone),
    [siteId, contentId, timeZone],
  );
  const { list, tableProps } = useListTable({ config: LIST, columns, data: rows });
  if (rows.length === 0) return <EmptyState>Nenhuma versão registrada.</EmptyState>;
  return (
    <>
      <ListToolbar
        search={list.state.search}
        searchLabel="Buscar por título"
        onSearchChange={list.setSearch}
        filters={[
          {
            column: 'status',
            label: 'Status',
            value: list.state.filters.status,
            options: STATUSES.map((status) => ({
              value: status,
              label: CONTENT_STATUS_LABEL[status],
            })),
          },
        ]}
        onFilterChange={list.setFilter}
        onClear={list.clearFilters}
      />
      <DataTable
        compact
        aria-labelledby={labelledBy}
        instanceId="content-versions-table"
        columns={columns}
        customNoDataIcon={<NoResults>Nenhuma versão encontrada.</NoResults>}
        {...tableProps}
      />
    </>
  );
}
