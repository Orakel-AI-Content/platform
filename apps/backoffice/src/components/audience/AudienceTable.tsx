'use client';

import DataTable, { type ColumnDef } from '@/components/shared/DataTable';
import { NoResults } from '@/components/shared/EmptyState';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState.ts';
import type { AudienceDay } from '@/domain/audience/read.ts';

import { formatAudienceDay, formatCount } from './format.ts';

/** Sem busca nem filtro; o dia mais recente primeiro (a ordem do domínio). */
const LIST: ListConfig = {
  filters: [],
  sortable: ['day', 'views', 'sessions'],
  defaultSort: { id: 'day', desc: true },
  pageSizes: [10, 25, 50],
};

const COLUMNS: ColumnDef<AudienceDay>[] = [
  {
    header: 'Dia',
    accessorKey: 'day',
    enableGlobalFilter: false,
    cell: ({ row }) => formatAudienceDay(row.original.day),
  },
  {
    header: 'Visualizações',
    accessorKey: 'views',
    enableGlobalFilter: false,
    cell: ({ row }) => <span className="tabular-nums">{formatCount(row.original.views)}</span>,
  },
  {
    header: 'Sessões',
    accessorKey: 'sessions',
    enableGlobalFilter: false,
    cell: ({ row }) => <span className="tabular-nums">{formatCount(row.original.sessions)}</span>,
  },
];

/**
 * Audiência do site por dia (#548): só os dias com linha consolidada (sem preencher zeros:
 * a ausência pode ser dia ainda não consolidado). No DataTable do template, com ordem e
 * paginação no cliente e o estado na URL, como as outras listas.
 */
export function AudienceTable({ rows }: { rows: AudienceDay[] }) {
  const { tableProps } = useListTable({ config: LIST, columns: COLUMNS, data: rows });
  return (
    <DataTable
      compact
      aria-label="Audiência por dia"
      instanceId="audience-table"
      columns={COLUMNS}
      customNoDataIcon={<NoResults>Nenhum dia no período.</NoResults>}
      {...tableProps}
    />
  );
}
