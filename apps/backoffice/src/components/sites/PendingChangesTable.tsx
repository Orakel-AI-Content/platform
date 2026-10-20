'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import DataTable, { type ColumnDef, type Row } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { ROW_LINK_CLASS } from '@/components/shared/rowLink';
import {
  formatDateTime,
  PENDING_ORIGIN_LABEL,
  pendingItem,
} from '@/components/shared/siteLabels.ts';
import { Truncated } from '@/components/shared/Truncated';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState.ts';
import type { PendingChange } from '@/domain/pending-changes/list.ts';
import type { PendingOrigin } from '@/domain/pending-changes/record.ts';

const ORIGINS = Object.keys(PENDING_ORIGIN_LABEL) as PendingOrigin[];

/** Busca pelo item, filtro por origem, a mais recente primeiro (a ordem do domínio) (#365). */
const LIST: ListConfig = {
  filters: [{ column: 'origin', param: 'origem', values: ORIGINS }],
  sortable: ['origin', 'item', 'createdAt'],
  defaultSort: { id: 'createdAt', desc: true },
  pageSizes: [10, 25, 50, 100],
};

/** Ordena pelo texto exibido em pt-BR (rótulo da origem, texto do item), não pelo valor. */
function byText(text: (change: PendingChange) => string) {
  return (a: Row<PendingChange>, b: Row<PendingChange>) =>
    text(a.original).localeCompare(text(b.original), 'pt-BR');
}

function columnsFor(siteId: string, timeZone: string): ColumnDef<PendingChange>[] {
  const itemText = (change: PendingChange) =>
    pendingItem(siteId, change.origin, change.reference).text;
  return [
    {
      header: 'Origem',
      accessorKey: 'origin',
      enableGlobalFilter: false,
      filterFn: 'equalsString',
      sortFn: byText((change) => PENDING_ORIGIN_LABEL[change.origin]),
      cell: ({ row }) => PENDING_ORIGIN_LABEL[row.original.origin],
    },
    {
      header: 'Item',
      id: 'item',
      // Busca e ordem pelo texto exibido ("Conteúdo 42"), não pela referência gravada.
      accessorFn: itemText,
      sortFn: byText(itemText),
      cell: ({ row }) => {
        const item = pendingItem(siteId, row.original.origin, row.original.reference);
        const text = <Truncated text={item.text} className="max-w-xs" />;
        return item.href ? (
          <Link href={item.href} className={ROW_LINK_CLASS}>
            {text}
            <span className="sr-only"> (abrir)</span>
          </Link>
        ) : (
          text
        );
      },
    },
    {
      header: 'Registrada em',
      accessorKey: 'createdAt',
      enableGlobalFilter: false,
      sortFn: 'datetime',
      cell: ({ row }) => formatDateTime(row.original.createdAt, timeZone),
    },
  ];
}

/**
 * Mudanças do site ainda não publicadas (#99), só leitura: origem, item (com link para a tela
 * dele, quando há) e data no fuso do site. No DataTable do template (#365): busca pelo item,
 * filtro por origem, ordem e paginação no cliente com o estado na URL; toolbar e tabela vão no
 * cartão da página, abaixo do `ListHeader`. Sem pendências, o estado vazio.
 */
export function PendingChangesTable({
  siteId,
  timeZone,
  rows,
  labelledBy,
}: {
  siteId: string;
  /** Fuso do site (`SiteSummary.timeZone`): as datas aparecem nele. */
  timeZone: string;
  rows: PendingChange[];
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
}) {
  const columns = useMemo(() => columnsFor(siteId, timeZone), [siteId, timeZone]);
  const { list, tableProps } = useListTable({ config: LIST, columns, data: rows });
  if (rows.length === 0) {
    return <EmptyState>Nenhuma mudança pendente: o site publicado está em dia.</EmptyState>;
  }
  return (
    <>
      <ListToolbar
        search={list.state.search}
        searchLabel="Buscar por item"
        onSearchChange={list.setSearch}
        filters={[
          {
            column: 'origin',
            label: 'Origem',
            value: list.state.filters.origin,
            options: ORIGINS.map((origin) => ({
              value: origin,
              label: PENDING_ORIGIN_LABEL[origin],
            })),
          },
        ]}
        onFilterChange={list.setFilter}
        onClear={list.clearFilters}
      />
      <DataTable
        compact
        aria-labelledby={labelledBy}
        instanceId="pending-changes-table"
        columns={columns}
        customNoDataIcon={<NoResults>Nenhuma mudança encontrada.</NoResults>}
        {...tableProps}
      />
    </>
  );
}
