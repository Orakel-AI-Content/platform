'use client';

import type { ReactNode } from 'react';

import { pushSuccess } from '@/components/shared/ActionFeedback.tsx';
import DataTable, { type ColumnDef } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { formatDateTime } from '@/components/shared/siteLabels.ts';
import { useCreatedAnnouncement } from '@/components/shared/useCreatedAnnouncement.ts';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState.ts';
import type { ReleaseRecord } from '@/domain/releases/releases.ts';

/**
 * Fuso das datas: a release é da rede, não de um site, então a data aparece no fuso da operação
 * (o mesmo do limite diário e do agendamento).
 */
export const RELEASE_TIME_ZONE = 'America/Sao_Paulo';

/** Busca pela tag; a mais recente primeiro (a ordem do domínio). */
const LIST: ListConfig = {
  filters: [],
  sortable: ['tag', 'registeredAt'],
  defaultSort: { id: 'registeredAt', desc: true },
  pageSizes: [10, 25, 50, 100],
};

const COLUMNS: ColumnDef<ReleaseRecord>[] = [
  {
    header: 'Tag',
    accessorKey: 'tag',
    // Ordem numérica das partes (core-v1.10.0 depois de core-v1.9.0), não alfabética.
    sortFn: (a, b) => a.original.tag.localeCompare(b.original.tag, 'pt-BR', { numeric: true }),
    cell: ({ row }) => <span className="font-semibold">{row.original.tag}</span>,
  },
  {
    header: 'Registrada em',
    accessorKey: 'registeredAt',
    enableGlobalFilter: false,
    sortFn: 'datetime',
    cell: ({ row }) => formatDateTime(row.original.registeredAt, RELEASE_TIME_ZONE),
  },
];

/**
 * Registro de releases (#509), só leitura: tag e data de registro, no DataTable do template,
 * como as outras listas (busca, ordem e paginação no cliente, estado na URL). Toolbar e tabela
 * vão no cartão da página, abaixo do `ListHeader`. Sem releases, o estado vazio com a ação.
 */
export function ReleasesTable({
  rows,
  emptyAction,
  created,
  labelledBy,
}: {
  rows: ReleaseRecord[];
  /** Ação principal da tela (registrar release), repetida no estado vazio. */
  emptyAction?: ReactNode;
  /** Release recém-registrada (`?registrada=<tag>`): anuncia a confirmação e tira a marca. */
  created?: string;
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
}) {
  const { list, tableProps } = useListTable({ config: LIST, columns: COLUMNS, data: rows });
  useCreatedAnnouncement(
    created === undefined ? undefined : `Release ${created} registrada.`,
    pushSuccess,
  );
  if (rows.length === 0) {
    return <EmptyState action={emptyAction}>Nenhuma release registrada.</EmptyState>;
  }
  return (
    <>
      <ListToolbar
        search={list.state.search}
        searchLabel="Buscar pela tag"
        onSearchChange={list.setSearch}
        onClear={list.clearFilters}
      />
      <DataTable
        compact
        aria-labelledby={labelledBy}
        instanceId="releases-table"
        columns={COLUMNS}
        customNoDataIcon={<NoResults>Nenhuma release encontrada.</NoResults>}
        {...tableProps}
      />
    </>
  );
}
