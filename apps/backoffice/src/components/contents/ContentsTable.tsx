'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';

import DataTable, { type ColumnDef, type Row } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { ROW_LINK_CLASS } from '@/components/shared/rowLink';
import { Truncated } from '@/components/shared/Truncated';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState.ts';

import {
  CONTENT_KIND_LABEL,
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_TAG,
  formatDateTime,
} from '@/components/shared/siteLabels.ts';
import { StateTag } from '@/components/sites/SiteStatus';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import type { ContentListItem } from '@/domain/content/contents.ts';

const KINDS = Object.keys(CONTENT_KIND_LABEL) as ContentListItem['kind'][];
const STATUSES = Object.keys(CONTENT_STATUS_LABEL) as ContentListItem['status'][];

/** Busca por título, filtros por tipo e status, mais recente primeiro (#107); tamanhos (#362). */
const LIST: ListConfig = {
  filters: [
    { column: 'kind', param: 'tipo', values: KINDS },
    { column: 'status', param: 'status', values: STATUSES },
  ],
  sortable: ['title', 'kind', 'status', 'updatedAt'],
  defaultSort: { id: 'updatedAt', desc: true },
  pageSizes: [10, 25, 50, 100],
};

/** Ordena pelo texto exibido em pt-BR (rótulo de tipo e status, título), não pelo valor. */
function byText(text: (item: ContentListItem) => string) {
  return (a: Row<ContentListItem>, b: Row<ContentListItem>) =>
    text(a.original).localeCompare(text(b.original), 'pt-BR');
}

function columnsFor(
  siteId: string,
  timeZone: string,
  canWrite: boolean,
): ColumnDef<ContentListItem>[] {
  const columns: ColumnDef<ContentListItem>[] = [
    {
      header: 'Tipo',
      accessorKey: 'kind',
      enableGlobalFilter: false,
      filterFn: 'equalsString',
      sortFn: byText((item) => CONTENT_KIND_LABEL[item.kind]),
      cell: ({ row }) => CONTENT_KIND_LABEL[row.original.kind],
    },
    {
      header: 'Título',
      accessorKey: 'title',
      sortFn: byText((item) => item.title),
      cell: ({ row }) => (
        <Link href={`/sites/${siteId}/conteudos/${row.original.id}`} className={ROW_LINK_CLASS}>
          <Truncated text={row.original.title} className="max-w-xs" />
          <span className="sr-only"> (versões)</span>
        </Link>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      enableGlobalFilter: false,
      filterFn: 'equalsString',
      sortFn: byText((item) => CONTENT_STATUS_LABEL[item.status]),
      cell: ({ row }) => (
        <StateTag color={CONTENT_STATUS_TAG[row.original.status]}>
          {CONTENT_STATUS_LABEL[row.original.status]}
        </StateTag>
      ),
    },
    { header: 'Versão', accessorKey: 'version', enableGlobalFilter: false, enableSorting: false },
    {
      header: 'Última alteração',
      accessorKey: 'updatedAt',
      enableGlobalFilter: false,
      sortFn: 'datetime',
      cell: ({ row }) => formatDateTime(row.original.updatedAt, timeZone),
    },
  ];
  if (!canWrite) return columns;
  return [
    ...columns,
    {
      id: 'actions',
      header: () => <span className="sr-only">Ações</span>,
      cell: ({ row }) => (
        <ButtonLink href={`/sites/${siteId}/conteudos/${row.original.id}/editar`} size="xs">
          Editar
          <span className="sr-only"> {row.original.title}</span>
        </ButtonLink>
      ),
    },
  ];
}

/**
 * Conteúdos de um site com a versão mais recente de cada um, com busca por título, filtros
 * por tipo e status, ordenação e paginação no cliente e o estado na URL (#107), no DataTable
 * do template (#362): toolbar e tabela vão no cartão da página, abaixo do `ListHeader`. Editar só
 * aparece com `canWrite` (content.write, decidido no servidor); criar é a ação do cabeçalho
 * da página, repetida no estado vazio. As rotas são do editor (#45).
 */
export function ContentsTable({
  siteId,
  timeZone,
  rows,
  canWrite = false,
  emptyAction,
  labelledBy,
}: {
  siteId: string;
  /** Fuso do site (`SiteSummary.timeZone`): as datas aparecem nele. */
  timeZone: string;
  rows: ContentListItem[];
  canWrite?: boolean;
  /** Ação principal da tela (criar conteúdo), repetida no estado vazio; só com permissão. */
  emptyAction?: ReactNode;
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
}) {
  const columns = useMemo(
    () => columnsFor(siteId, timeZone, canWrite),
    [siteId, timeZone, canWrite],
  );
  const { list, tableProps } = useListTable({ config: LIST, columns, data: rows });
  if (rows.length === 0) {
    return <EmptyState action={emptyAction}>Nenhum conteúdo cadastrado.</EmptyState>;
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
        aria-labelledby={labelledBy}
        instanceId="contents-table"
        columns={columns}
        customNoDataIcon={<NoResults>Nenhum conteúdo encontrado.</NoResults>}
        {...tableProps}
      />
    </>
  );
}
