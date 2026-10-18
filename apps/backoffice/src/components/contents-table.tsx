'use client';

import { createColumnHelper, useTable, type Row } from '@tanstack/react-table';
import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';

import { EmptyState } from '@/components/empty-state';
import { ListPagination, ListToolbar, SortableHead } from '@/components/list-controls.tsx';
import { listFeatures, useListState, type ListConfig } from '@/components/list-state.ts';

import {
  CONTENT_KIND_LABEL,
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_TAG,
  formatDateTime,
} from '@/components/site-labels.ts';
import { StateTag } from '@/components/site-status';
import { Button } from '@/components/ui/Button';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import Table from '@/components/ui/Table';
import type { ContentListItem } from '@/domain/content/contents.ts';

const column = createColumnHelper<typeof listFeatures, ContentListItem>();
const { THead, TBody, Tr, Th, Td } = Table;

const KINDS = Object.keys(CONTENT_KIND_LABEL) as ContentListItem['kind'][];
const STATUSES = Object.keys(CONTENT_STATUS_LABEL) as ContentListItem['status'][];

/** Busca por título, filtros por tipo e status, mais recente primeiro (#107). */
const LIST: ListConfig = {
  filters: [
    { column: 'kind', param: 'tipo', values: KINDS },
    { column: 'status', param: 'status', values: STATUSES },
  ],
  sortable: ['title', 'kind', 'status', 'updatedAt'],
  defaultSort: { id: 'updatedAt', desc: true },
};

/** Ordena pelo texto exibido em pt-BR (rótulo de tipo e status, título), não pelo valor. */
function byText(text: (item: ContentListItem) => string) {
  return (
    a: Row<typeof listFeatures, ContentListItem>,
    b: Row<typeof listFeatures, ContentListItem>,
  ) => text(a.original).localeCompare(text(b.original), 'pt-BR');
}

function columnsFor(siteId: string, timeZone: string) {
  return column.columns([
    column.accessor('kind', {
      header: 'Tipo',
      enableGlobalFilter: false,
      filterFn: 'equalsString',
      sortFn: byText((item) => CONTENT_KIND_LABEL[item.kind]),
      cell: (info) => CONTENT_KIND_LABEL[info.getValue()],
    }),
    column.accessor('title', {
      header: 'Título',
      sortFn: byText((item) => item.title),
      cell: (info) => (
        <Link
          href={`/sites/${siteId}/conteudos/${info.row.original.id}`}
          className="font-semibold text-gray-900 underline underline-offset-4 hover:text-primary dark:text-gray-100"
        >
          {info.getValue()}
          <span className="sr-only"> (versões)</span>
        </Link>
      ),
    }),
    column.accessor('status', {
      header: 'Status',
      enableGlobalFilter: false,
      filterFn: 'equalsString',
      sortFn: byText((item) => CONTENT_STATUS_LABEL[item.status]),
      cell: (info) => (
        <StateTag color={CONTENT_STATUS_TAG[info.getValue()]}>
          {CONTENT_STATUS_LABEL[info.getValue()]}
        </StateTag>
      ),
    }),
    column.accessor('version', {
      header: 'Versão',
      enableGlobalFilter: false,
      enableSorting: false,
    }),
    column.accessor('updatedAt', {
      header: 'Última alteração',
      enableGlobalFilter: false,
      sortFn: 'datetime',
      cell: (info) => formatDateTime(info.getValue(), timeZone),
    }),
  ]);
}

/**
 * Conteúdos de um site com a versão mais recente de cada um, com busca por título, filtros
 * por tipo e status, ordenação e paginação no cliente e o estado na URL (#107). Editar só
 * aparece com `canWrite` (content.write, decidido no servidor); criar é a ação do cabeçalho
 * da página, repetida no estado vazio. As rotas são do editor (#45).
 */
export function ContentsTable({
  siteId,
  timeZone,
  rows,
  canWrite = false,
  emptyAction,
}: {
  siteId: string;
  /** Fuso do site (`SiteSummary.timeZone`): as datas aparecem nele. */
  timeZone: string;
  rows: ContentListItem[];
  canWrite?: boolean;
  /** Ação principal da tela (criar conteúdo), repetida no estado vazio; só com permissão. */
  emptyAction?: ReactNode;
}) {
  const list = useListState(LIST);
  const columns = useMemo(() => columnsFor(siteId, timeZone), [siteId, timeZone]);
  const table = useTable({ features: listFeatures, columns, data: rows, ...list.table });
  if (rows.length === 0) {
    return <EmptyState action={emptyAction}>Nenhum conteúdo cadastrado.</EmptyState>;
  }
  const found = table.getPrePaginatedRowModel().rows.length;
  return (
    <div className="space-y-4">
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
      {found === 0 ? (
        <EmptyState
          action={
            <Button type="button" onClick={list.clearFilters}>
              Limpar busca
            </Button>
          }
        >
          Nenhum conteúdo encontrado.
        </EmptyState>
      ) : (
        <Table compact>
          <THead>
            {table.getHeaderGroups().map((group) => (
              <Tr key={group.id}>
                {group.headers.map((header) =>
                  header.column.getCanSort() ? (
                    <SortableHead
                      key={header.id}
                      scope="col"
                      label={String(header.column.columnDef.header)}
                      direction={header.column.getIsSorted()}
                      onToggle={() => header.column.toggleSorting()}
                    />
                  ) : (
                    <Th key={header.id} scope="col">
                      <table.FlexRender header={header} />
                    </Th>
                  ),
                )}
                {canWrite && (
                  <Th scope="col">
                    <span className="sr-only">Ações</span>
                  </Th>
                )}
              </Tr>
            ))}
          </THead>
          <TBody>
            {table.getRowModel().rows.map((row) => (
              <Tr key={row.id}>
                {row.getAllCells().map((cell) => (
                  <Td key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </Td>
                ))}
                {canWrite && (
                  <Td>
                    <ButtonLink
                      href={`/sites/${siteId}/conteudos/${row.original.id}/editar`}
                      size="xs"
                    >
                      Editar
                      <span className="sr-only"> {row.original.title}</span>
                    </ButtonLink>
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <ListPagination
        total={found}
        page={list.state.page}
        pageCount={table.getPageCount()}
        onPageChange={list.setPage}
      />
    </div>
  );
}
