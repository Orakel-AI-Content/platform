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
  /** Quem aprovou a versão e quando (`reviews`); nula sem aprovação. */
  approval: { reviewer: string; approvedAt: Date } | null;
};

const STATUSES = Object.keys(CONTENT_STATUS_LABEL) as ContentVersionRow['status'][];

/** Busca pelo título, filtro por status, da primeira à mais recente (a ordem do domínio) (#366). */
const LIST: ListConfig = {
  filters: [{ column: 'status', param: 'status', values: STATUSES }],
  sortable: ['version', 'status', 'title', 'createdAt'],
  defaultSort: { id: 'version', desc: false },
  pageSizes: [10, 25, 50, 100],
};

/** Ordena pelo texto exibido em pt-BR (rótulo do status, título), não pelo valor. */
function byText(text: (row: ContentVersionRow) => string) {
  return (a: Row<ContentVersionRow>, b: Row<ContentVersionRow>) =>
    text(a.original).localeCompare(text(b.original), 'pt-BR');
}

function columnsFor(
  siteId: string,
  contentId: number,
  timeZone: string,
): ColumnDef<ContentVersionRow>[] {
  return [
    {
      header: 'Versão',
      accessorKey: 'version',
      enableGlobalFilter: false,
      sortFn: 'basic',
      // Número começa descendente no TanStack; a ordem padrão já é a crescente, então o
      // primeiro clique inverte em vez de voltar ao padrão.
      sortDescFirst: false,
      cell: ({ row }) => (
        <Link
          href={`/sites/${siteId}/conteudos/${contentId}/versoes/${row.original.version}`}
          className={ROW_LINK_CLASS}
        >
          Versão {row.original.version}
        </Link>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      enableGlobalFilter: false,
      filterFn: 'equalsString',
      sortFn: byText((row) => CONTENT_STATUS_LABEL[row.status]),
      cell: ({ row }) => (
        <StateTag color={CONTENT_STATUS_TAG[row.original.status]}>
          {CONTENT_STATUS_LABEL[row.original.status]}
        </StateTag>
      ),
    },
    {
      header: 'Título',
      accessorKey: 'title',
      sortFn: byText((row) => row.title),
      cell: ({ row }) => <Truncated text={row.original.title} className="max-w-xs" />,
    },
    {
      header: 'Gravada em',
      accessorKey: 'createdAt',
      enableGlobalFilter: false,
      sortFn: 'datetime',
      cell: ({ row }) => formatDateTime(row.original.createdAt, timeZone),
    },
    // Duas linhas: o revisor e, embaixo, a data; vazia sem aprovação.
    {
      header: 'Aprovação',
      accessorKey: 'approval',
      enableGlobalFilter: false,
      enableSorting: false,
      cell: ({ row }) => {
        const { approval } = row.original;
        if (approval === null) return null;
        return (
          <TwoLines secondary={formatDateTime(approval.approvedAt, timeZone)}>
            {approval.reviewer}
          </TwoLines>
        );
      },
    },
  ];
}

/**
 * Versões de um conteúdo, cada uma com link para lê-la. No DataTable do template (#366): busca
 * pelo título, filtro por status, ordem (da primeira à mais recente, por padrão) e paginação no
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
