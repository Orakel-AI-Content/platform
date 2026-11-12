'use client';

import { useCallback, useMemo, useState, useTransition, type ReactNode } from 'react';

import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog, {
  dangerButtonClass,
  dangerConfirmButtonProps,
} from '@/components/shared/ConfirmDialog.tsx';
import DataTable, { type ColumnDef } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { formatDateTime, type StateTagColor } from '@/components/shared/siteLabels.ts';
import { TwoLines } from '@/components/shared/TwoLines';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState.ts';
import { usePolling } from '@/components/shared/usePolling.ts';
import { StateTag } from '@/components/sites/SiteStatus';
import { Button } from '@/components/ui/Button';
import useCallbackRef from '@/components/ui/hooks/useCallbackRef';
import type { ReleasePipelineState, ReleaseRecord } from '@/domain/releases/releases.ts';

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

/** Ação de uma linha sobre a release da tag ("Tentar de novo", "Descartar"). */
export type ReleaseAction = (tag: string) => Promise<ActionResult>;

/** Releases e as tags que algum site usa: o que a página carrega e o polling relê. */
export type ReleasesSnapshot = { rows: ReleaseRecord[]; inUse: string[] };

/** Leitura do polling; `undefined` quando não deu para ler (o próximo tique tenta de novo). */
export type ReleasesStatus = () => Promise<ReleasesSnapshot | undefined>;

/** Intervalo do polling enquanto alguma release está no pipeline. */
export const RELEASES_POLL_MS = 3000;

// Referência estável para o padrão: um `[]` novo a cada render trocaria as linhas sem parar.
const NONE: string[] = [];

/** Estados em que o pipeline anda sozinho: só com algum deles a lista se atualiza. */
const IN_PIPELINE: ReadonlySet<ReleasePipelineState> = new Set(['gerando', 'baixando']);

export const RELEASE_STATE_LABEL: Record<ReleasePipelineState, string> = {
  gerando: 'Gerando',
  baixando: 'Baixando',
  disponivel: 'Disponível',
  falhou: 'Falhou',
  descartada: 'Descartada',
};

const RELEASE_STATE_VARIANT: Record<ReleasePipelineState, StateTagColor> = {
  gerando: 'bg-info',
  baixando: 'bg-primary-mild',
  disponivel: 'bg-success',
  falhou: 'bg-error',
  descartada: 'bg-gray-400',
};

/** Segunda linha: a etapa enquanto o pipeline anda; em `falhou`, o motivo. */
function stateDetail(release: ReleaseRecord): string | undefined {
  switch (release.pipelineState) {
    case 'gerando':
      return 'Etapa 1 de 3 · gerando a imagem no CI';
    case 'baixando':
      return 'Etapa 2 de 3 · baixando a imagem';
    case 'falhou':
      return release.failureReason ?? 'Motivo não registrado';
    default:
      return undefined;
  }
}

/** Estado do pipeline e, abaixo, a etapa ou o motivo, com o link do run quando há um. */
function StateCell({ release }: { release: ReleaseRecord }) {
  const detail = stateDetail(release);
  const run =
    release.runUrl === null ? undefined : (
      <a
        href={release.runUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-primary"
      >
        Ver run<span className="sr-only"> da release {release.tag} no GitHub</span>
      </a>
    );
  const secondary =
    detail === undefined && run === undefined ? undefined : (
      <>
        {detail}
        {detail !== undefined && run !== undefined && ' · '}
        {run}
      </>
    );
  return (
    <TwoLines secondary={secondary}>
      <StateTag color={RELEASE_STATE_VARIANT[release.pipelineState]}>
        {RELEASE_STATE_LABEL[release.pipelineState]}
      </StateTag>
    </TwoLines>
  );
}

/** "Tentar de novo" de uma release em `falhou`, sem confirmação: só retoma a etapa. */
function RetryButton({
  tag,
  action,
  onResult,
}: {
  tag: string;
  action: ReleaseAction;
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
      {pending ? 'Enviando…' : 'Tentar de novo'}
      <span className="sr-only"> a release {tag}</span>
    </Button>
  );
}

/** "Descartar", confirmado no `ConfirmDialog` danger, como as outras ações destrutivas. */
function DiscardButton({
  tag,
  action,
  onResult,
}: {
  tag: string;
  action: ReleaseAction;
  onResult: (result: ActionResult) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        type="button"
        size="sm"
        disabled={pending}
        customColorClass={dangerButtonClass}
        onClick={() => setConfirming(true)}
      >
        {pending ? 'Descartando…' : 'Descartar'}
        <span className="sr-only"> a release {tag}</span>
      </Button>
      <ConfirmDialog
        isOpen={confirming}
        type="danger"
        title={`Descartar a release ${tag}?`}
        confirmText="Descartar"
        confirmButtonProps={dangerConfirmButtonProps}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          startTransition(async () => onResult(await action(tag)));
        }}
      >
        <p>
          A release deixa de ser oferecida aos sites. O número {tag} continua contado: a próxima
          versão não o reaproveita.
        </p>
      </ConfirmDialog>
    </>
  );
}

type RowActions = {
  retry: ReleaseAction | undefined;
  discard: ReleaseAction | undefined;
  inUse: ReadonlySet<string>;
  onResult: (result: ActionResult) => void;
};

/** "Tentar de novo" só em `falhou`; "Descartar" só sem site usando e fora de `descartada`. */
function RowButtons({ release, actions }: { release: ReleaseRecord; actions: RowActions }) {
  const { retry, discard, inUse, onResult } = actions;
  const canRetry = retry !== undefined && release.pipelineState === 'falhou';
  const canDiscard =
    discard !== undefined && release.pipelineState !== 'descartada' && !inUse.has(release.tag);
  return (
    <span className="flex justify-end gap-2">
      {canRetry && <RetryButton tag={release.tag} action={retry} onResult={onResult} />}
      {canDiscard && <DiscardButton tag={release.tag} action={discard} onResult={onResult} />}
    </span>
  );
}

function columnsFor(actions: RowActions): ColumnDef<ReleaseRecord>[] {
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
      header: 'Estado',
      accessorKey: 'pipelineState',
      enableGlobalFilter: false,
      enableSorting: false,
      cell: ({ row }) => <StateCell release={row.original} />,
    },
  ];
  if (actions.retry === undefined && actions.discard === undefined) return columns;
  return [
    ...columns,
    {
      id: 'actions',
      header: () => <span className="sr-only">Ações</span>,
      cell: ({ row }) => <RowButtons release={row.original} actions={actions} />,
    },
  ];
}

/**
 * Linhas da tabela: as da página até o polling trazer outras. Quando a página entrega linhas
 * novas (depois de `revalidatePath` de uma ação), elas substituem as do polling. O polling só
 * roda com alguma release em `gerando` ou `baixando`.
 */
function useReleasesSnapshot(
  rows: ReleaseRecord[],
  inUse: string[],
  status: ReleasesStatus | undefined,
  pollMs: number,
): ReleasesSnapshot {
  const [source, setSource] = useState<ReleasesSnapshot>({ rows, inUse });
  const [snapshot, setSnapshot] = useState<ReleasesSnapshot>(source);
  if (source.rows !== rows || source.inUse !== inUse) {
    const next = { rows, inUse };
    setSource(next);
    setSnapshot(next);
  }
  const poll = useCallback(async () => {
    const next = await status?.();
    if (next !== undefined) setSnapshot(next);
  }, [status]);
  const active =
    status !== undefined && snapshot.rows.some((release) => IN_PIPELINE.has(release.pipelineState));
  usePolling(active, poll, pollMs);
  return snapshot;
}

/**
 * Registro de releases (#509): tag, data de registro e estado do pipeline que gera a versão
 * (#665), no DataTable do template, como as outras listas (busca, ordem e paginação no cliente,
 * estado na URL). Com alguma release gerando ou baixando, a lista se relê sozinha. Toolbar, erro
 * das ações e tabela vão no cartão da página, abaixo do `ListHeader`; o erro fica num Alert entre
 * a toolbar e a tabela, nunca na linha (#324). Sem releases, o estado vazio com a ação.
 */
export function ReleasesTable({
  rows,
  inUse = NONE,
  retry,
  discard,
  status,
  pollMs = RELEASES_POLL_MS,
  emptyAction,
  labelledBy,
}: {
  rows: ReleaseRecord[];
  /** Tags que algum site usa: nelas, "Descartar" não aparece. */
  inUse?: string[];
  /** Action de "Tentar de novo"; sem ela e sem `discard`, a coluna de ações não aparece. */
  retry?: ReleaseAction;
  /** Action de "Descartar". */
  discard?: ReleaseAction;
  /** Leitura do polling; sem ela, a lista não se atualiza sozinha. */
  status?: ReleasesStatus;
  pollMs?: number;
  /** Ação principal da tela (gerar nova versão), repetida no estado vazio. */
  emptyAction?: ReactNode;
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
}) {
  const snapshot = useReleasesSnapshot(rows, inUse, status, pollMs);
  const { error, report } = useActionResult();
  // O `report` muda a cada render; a referência estável não refaz as colunas por isso.
  const onResult = useCallbackRef(report);
  const inUseSet = useMemo(() => new Set(snapshot.inUse), [snapshot.inUse]);
  const columns = useMemo(
    () => columnsFor({ retry, discard, inUse: inUseSet, onResult }),
    [retry, discard, inUseSet, onResult],
  );
  const { list, tableProps } = useListTable({ config: LIST, columns, data: snapshot.rows });
  if (snapshot.rows.length === 0) {
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
