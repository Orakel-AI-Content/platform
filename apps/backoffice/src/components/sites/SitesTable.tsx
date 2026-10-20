'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';

import {
  LIFECYCLE_LABEL,
  SITE_STATE_LABEL,
  SITE_STATE_VARIANT,
} from '@/components/shared/siteLabels.ts';
import {
  LastBuildSummary,
  PendingCount,
  PublishNowButton,
  StateTag,
  type PublishNow,
} from '@/components/sites/SiteStatus';
import { ActionAlert, pushSuccess, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import DataTable, { type ColumnDef, type Row } from '@/components/shared/DataTable';
import EllipsisButton from '@/components/shared/EllipsisButton';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { ROW_LINK_CLASS } from '@/components/shared/rowLink.ts';
import { Truncated } from '@/components/shared/Truncated';
import { TwoLines } from '@/components/shared/TwoLines';
import { useCreatedAnnouncement } from '@/components/shared/useCreatedAnnouncement.ts';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState.ts';
import Dropdown from '@/components/ui/Dropdown';
import useCallbackRef from '@/components/ui/hooks/useCallbackRef';
import classNames from '@/components/ui/utils/classNames';
import type { SiteSummary } from '@/domain/sites/sites.ts';

const STATES = Object.keys(SITE_STATE_LABEL) as SiteSummary['state'][];

/** Busca por nome, id e domínio, filtro por estado, ordem por nome (#364). */
const LIST: ListConfig = {
  filters: [{ column: 'state', param: 'estado', values: STATES }],
  // Só Site e Estado: o ícone de ordem alarga o cabeçalho, e a 1280 px a tabela não cabe com
  // ele em todas as colunas (#248).
  sortable: ['name', 'state'],
  defaultSort: { id: 'name', desc: false },
  pageSizes: [10, 25, 50, 100],
};

/** Ordena pelo texto exibido em pt-BR (nome, rótulo do estado), não pelo valor. */
function byText(text: (site: SiteSummary) => string) {
  return (a: Row<SiteSummary>, b: Row<SiteSummary>) =>
    text(a.original).localeCompare(text(b.original), 'pt-BR');
}

/**
 * Último build: a lista mistura fusos, cada linha com a sigla; data e versão cortadas. Os cortes
 * desta tabela (nome, motivo, build) cabem a 1280 px dentro do cartão do template (#248, #364).
 */
function LastBuildCell({ build, timeZone }: { build: SiteSummary['lastBuild']; timeZone: string }) {
  return (
    <LastBuildSummary
      build={build}
      timeZone={timeZone}
      details={(text) => <Truncated text={text} className="max-w-28" />}
    />
  );
}

/**
 * "Mais ações" do template (`Dropdown` com o `EllipsisButton`, como no Ecme). O gatilho do
 * `renderTitle` já é o elemento focável (`role="button"`, com o nome); o `EllipsisButton` vira
 * um <span> dentro dele, para não aninhar um botão em outro.
 */
function MoreActions({ siteId, canConfigure }: { siteId: string; canConfigure: boolean }) {
  return (
    <Dropdown
      aria-label={`Mais ações: ${siteId}`}
      placement="bottom-end"
      renderTitle={
        <EllipsisButton asElement="span" aria-hidden="true" aria-label={`Mais ações: ${siteId}`} />
      }
    >
      <Dropdown.Item asElement={Link} href={`/sites/${siteId}/conteudos`}>
        Conteúdos<span className="sr-only"> {siteId}</span>
      </Dropdown.Item>
      <Dropdown.Item asElement={Link} href={`/sites/${siteId}/midia`}>
        Mídia<span className="sr-only"> {siteId}</span>
      </Dropdown.Item>
      {canConfigure && (
        <Dropdown.Item asElement={Link} href={`/sites/${siteId}/configuracao`}>
          Editar configuração<span className="sr-only"> {siteId}</span>
        </Dropdown.Item>
      )}
    </Dropdown>
  );
}

function columnsFor(
  publishNow: PublishNow | undefined,
  canConfigure: boolean,
  onResult: (result: ActionResult) => void,
): ColumnDef<SiteSummary>[] {
  return [
    {
      header: 'Site',
      id: 'name',
      // A busca procura no nome, no id e no domínio; a ordem é só pelo nome.
      accessorFn: (site) => `${site.name} ${site.id} ${site.domain}`,
      sortFn: byText((site) => site.name),
      cell: ({ row }) => {
        const site = row.original;
        return (
          <TwoLines
            secondary={<Truncated text={`${site.id} · ${site.domain}`} className="max-w-32" />}
          >
            <Link
              href={`/sites/${site.id}`}
              title={site.name}
              className={classNames('block max-w-32 truncate', ROW_LINK_CLASS)}
            >
              {site.name}
            </Link>
          </TwoLines>
        );
      },
    },
    {
      header: 'Ciclo de vida',
      accessorKey: 'lifecycle',
      enableGlobalFilter: false,
      enableSorting: false,
      cell: ({ row }) => {
        const { lifecycle, release } = row.original;
        return (
          <TwoLines secondary={release ? `Release ${release}` : 'Sem release'}>
            {LIFECYCLE_LABEL[lifecycle]}
          </TwoLines>
        );
      },
    },
    {
      header: 'Estado',
      accessorKey: 'state',
      enableGlobalFilter: false,
      filterFn: 'equalsString',
      sortFn: byText((site) => SITE_STATE_LABEL[site.state]),
      cell: ({ row }) => {
        const site = row.original;
        const reason = site.state === 'pausado' ? site.pausedReason : null;
        return (
          <TwoLines
            secondary={reason ? <Truncated text={reason} className="max-w-24" /> : undefined}
          >
            <StateTag color={SITE_STATE_VARIANT[site.state]}>
              {SITE_STATE_LABEL[site.state]}
            </StateTag>
          </TwoLines>
        );
      },
    },
    {
      header: 'Indexável',
      accessorKey: 'indexavel',
      enableGlobalFilter: false,
      enableSorting: false,
      cell: ({ row }) => (row.original.indexavel ? 'Sim' : 'Não'),
    },
    {
      header: 'Pendências',
      accessorKey: 'pendingChanges',
      enableGlobalFilter: false,
      enableSorting: false,
      cell: ({ row }) => (
        <PendingCount siteId={row.original.id} count={row.original.pendingChanges} />
      ),
    },
    {
      header: 'Último build',
      accessorKey: 'lastBuild',
      enableGlobalFilter: false,
      enableSorting: false,
      cell: ({ row }) => (
        <LastBuildCell build={row.original.lastBuild} timeZone={row.original.timeZone} />
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Ações</span>,
      cell: ({ row }) => {
        const site = row.original;
        return (
          // Um botão sob o outro: lado a lado, a coluna não cabe a 1280 px (#248).
          <span className="flex flex-col items-end gap-1">
            {publishNow && site.state !== 'pausado' && (
              <PublishNowButton siteId={site.id} action={publishNow} onResult={onResult} />
            )}
            <MoreActions siteId={site.id} canConfigure={canConfigure} />
          </span>
        );
      },
    },
  ];
}

/**
 * Registro de instâncias no DataTable do template (#364): busca por nome, id e domínio, filtro
 * por estado, ordenação e paginação no cliente com o estado na URL. Toolbar, retorno das ações
 * e tabela vão no cartão da página, abaixo do `ListHeader`; o erro de "Publicar agora" fica num
 * Alert do cartão, entre a toolbar e a tabela, nunca na linha (#324).
 */
export function SitesTable({
  rows,
  publishNow,
  canConfigure = false,
  emptyAction,
  created,
  labelledBy,
}: {
  rows: SiteSummary[];
  publishNow?: PublishNow;
  canConfigure?: boolean;
  /** Ação principal da tela (cadastrar site), repetida no estado vazio; só com permissão. */
  emptyAction?: ReactNode;
  /** Site recém-cadastrado (`?cadastrado=<id>`): anuncia a confirmação e tira a marca da URL. */
  created?: string;
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
}) {
  const { error, report } = useActionResult();
  // O `report` muda a cada render; a referência estável não refaz as colunas por isso.
  const onResult = useCallbackRef(report);
  const columns = useMemo(
    () => columnsFor(publishNow, canConfigure, onResult),
    [publishNow, canConfigure, onResult],
  );
  const { list, tableProps } = useListTable({ config: LIST, columns, data: rows });
  useCreatedAnnouncement(
    created === undefined ? undefined : `Site ${created} cadastrado.`,
    pushSuccess,
  );
  if (rows.length === 0) {
    return <EmptyState action={emptyAction}>Nenhum site cadastrado.</EmptyState>;
  }
  return (
    <>
      <ListToolbar
        search={list.state.search}
        searchLabel="Buscar por nome, ID ou domínio"
        onSearchChange={list.setSearch}
        filters={[
          {
            column: 'state',
            label: 'Estado',
            value: list.state.filters.state,
            options: STATES.map((state) => ({ value: state, label: SITE_STATE_LABEL[state] })),
          },
        ]}
        onFilterChange={list.setFilter}
        onClear={list.clearFilters}
      />
      <ActionAlert error={error} />
      <DataTable
        compact
        aria-labelledby={labelledBy}
        instanceId="sites-table"
        columns={columns}
        customNoDataIcon={<NoResults>Nenhum site encontrado.</NoResults>}
        {...tableProps}
      />
    </>
  );
}
