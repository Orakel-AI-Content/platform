'use client';

import { useMemo, useTransition, type ReactNode } from 'react';

import { ActionAlert, pushSuccess, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import DataTable, { type ColumnDef } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { formatDateTime, type StateTagColor } from '@/components/shared/siteLabels.ts';
import { TwoLines } from '@/components/shared/TwoLines';
import { useCreatedAnnouncement } from '@/components/shared/useCreatedAnnouncement.ts';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState.ts';
import { StateTag } from '@/components/sites/SiteStatus';
import { Button } from '@/components/ui/Button';
import useCallbackRef from '@/components/ui/hooks/useCallbackRef';
import type { ReleaseImageStatus, ReleaseRecord } from '@/domain/releases/releases.ts';

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

/** "Reconferir": enfileira de novo a conferência da imagem da release (`requestReleaseImageCheck`). */
export type RecheckReleaseImage = (tag: string) => Promise<ActionResult>;

/** Estado da imagem site-builder:X.Y.Z no host; `null` = ainda não conferida. */
export const RELEASE_IMAGE_LABEL: Record<ReleaseImageStatus | 'nao_conferida', string> = {
  disponivel: 'Imagem disponível',
  ausente: 'Imagem ausente',
  nao_conferida: 'Não conferida',
};

const RELEASE_IMAGE_VARIANT: Record<ReleaseImageStatus | 'nao_conferida', StateTagColor> = {
  disponivel: 'bg-success',
  ausente: 'bg-error',
  nao_conferida: 'bg-gray-400',
};

/** Estado da imagem e, abaixo, quando foi conferida. */
function ImageCell({ release }: { release: ReleaseRecord }) {
  const status = release.imageStatus ?? 'nao_conferida';
  return (
    <TwoLines
      secondary={
        release.imageCheckedAt === null
          ? undefined
          : `Conferida em ${formatDateTime(release.imageCheckedAt, RELEASE_TIME_ZONE)}`
      }
    >
      <StateTag color={RELEASE_IMAGE_VARIANT[status]}>{RELEASE_IMAGE_LABEL[status]}</StateTag>
    </TwoLines>
  );
}

/**
 * "Reconferir" de uma linha, sem confirmação: só enfileira uma leitura no build-runner. O
 * resultado aparece ao recarregar a lista.
 */
function RecheckButton({
  tag,
  action,
  onResult,
}: {
  tag: string;
  action: RecheckReleaseImage;
  onResult: (result: ActionResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(async () => onResult(await action(tag)))}
    >
      {pending ? 'Enfileirando…' : 'Reconferir'}
      <span className="sr-only"> a imagem da release {tag}</span>
    </Button>
  );
}

function columnsFor(
  recheck: RecheckReleaseImage | undefined,
  onResult: (result: ActionResult) => void,
): ColumnDef<ReleaseRecord>[] {
  const columns: ColumnDef<ReleaseRecord>[] = [
    {
      header: 'Tag',
      accessorKey: 'tag',
      // Ordem numérica das partes (1.10.0 depois de 1.9.0), não alfabética.
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
    {
      header: 'Imagem',
      accessorKey: 'imageStatus',
      enableGlobalFilter: false,
      enableSorting: false,
      cell: ({ row }) => <ImageCell release={row.original} />,
    },
  ];
  if (recheck === undefined) return columns;
  return [
    ...columns,
    {
      id: 'actions',
      header: () => <span className="sr-only">Ações</span>,
      cell: ({ row }) => (
        <span className="flex justify-end">
          <RecheckButton tag={row.original.tag} action={recheck} onResult={onResult} />
        </span>
      ),
    },
  ];
}

/**
 * Registro de releases (#509): tag, data de registro e estado da imagem no host (#574), no
 * DataTable do template, como as outras listas (busca, ordem e paginação no cliente, estado na
 * URL). Toolbar, erro de "Reconferir" e tabela vão no cartão da página, abaixo do `ListHeader`;
 * o erro fica num Alert entre a toolbar e a tabela, nunca na linha (#324). Sem releases, o
 * estado vazio com a ação.
 */
export function ReleasesTable({
  rows,
  recheck,
  emptyAction,
  created,
  labelledBy,
}: {
  rows: ReleaseRecord[];
  /** Action de reconferir a imagem; sem ela, a coluna de ações não aparece. */
  recheck?: RecheckReleaseImage;
  /** Ação principal da tela (registrar release), repetida no estado vazio. */
  emptyAction?: ReactNode;
  /** Release recém-registrada (`?registrada=<tag>`): anuncia a confirmação e tira a marca. */
  created?: string;
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
}) {
  const { error, report } = useActionResult();
  // O `report` muda a cada render; a referência estável não refaz as colunas por isso.
  const onResult = useCallbackRef(report);
  const columns = useMemo(() => columnsFor(recheck, onResult), [recheck, onResult]);
  const { list, tableProps } = useListTable({ config: LIST, columns, data: rows });
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
      <ActionAlert error={error} />
      <DataTable
        compact
        aria-labelledby={labelledBy}
        instanceId="releases-table"
        columns={columns}
        customNoDataIcon={<NoResults>Nenhuma release encontrada.</NoResults>}
        {...tableProps}
      />
    </>
  );
}
