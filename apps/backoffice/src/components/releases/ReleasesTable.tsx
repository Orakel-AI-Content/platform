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
import Alert from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import useCallbackRef from '@/components/ui/hooks/useCallbackRef';
import type { PreviewState } from '@/domain/preview/preview.ts';
import type { ReleasePipelineState, ReleaseRecord } from '@/domain/releases/releases.ts';
import type { Rollout } from '@/domain/releases/rollout.ts';

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

/**
 * Releases, as tags que algum site usa, o estado da prévia, a última atualização de todos os
 * sites e a versão que uma nova levaria (a `disponivel` mais recente): o que a página carrega e
 * o polling relê.
 */
export type ReleasesSnapshot = {
  rows: ReleaseRecord[];
  inUse: string[];
  preview: PreviewState;
  rollout: Rollout | null;
  rolloutTarget: string | null;
};

/** Leitura do polling; `undefined` quando não deu para ler (o próximo tique tenta de novo). */
export type ReleasesStatus = () => Promise<ReleasesSnapshot | undefined>;

/** Intervalo do polling enquanto alguma release está no pipeline ou a prévia está atualizando. */
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

/**
 * Aviso da prévia no topo da lista (#710): trocando de versão, troca que falhou (com o motivo) ou
 * sem versão. No ar, nada. O contêiner fica sempre montado com `role="status"`, para o leitor de
 * tela anunciar a mudança que o polling traz.
 */
function PreviewNotice({ preview }: { preview: PreviewState | undefined }) {
  return (
    <div role="status" aria-label="Estado da prévia">
      {preview !== undefined && <PreviewAlert preview={preview} />}
    </div>
  );
}

function PreviewAlert({ preview }: { preview: PreviewState }) {
  switch (preview.status) {
    case 'atualizando':
      return (
        <Alert type="info" showIcon duration={0}>
          Prévia atualizando para {preview.targetRelease}.
        </Alert>
      );
    case 'falhou':
      return (
        <Alert type="danger" showIcon duration={0} title="A prévia não foi atualizada">
          {`A troca para ${preview.targetRelease ?? 'a nova versão'} falhou: ${
            preview.failureReason ?? 'motivo não registrado'
          }.`}
          {preview.currentRelease !== null &&
            ` A prévia continua na versão ${preview.currentRelease}.`}
        </Alert>
      );
    case 'sem_versao':
      return (
        <Alert type="warning" showIcon duration={0}>
          A prévia não tem versão: nenhuma release passou por um build ok.
        </Alert>
      );
    default:
      return null;
  }
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

/**
 * Tag da release e, na que está no ar na prévia, a tag "Prévia". Durante a troca ou depois de
 * uma troca que falhou, a anterior continua no ar (blue/green) e segue marcada.
 */
function TagCell({ tag, previewRelease }: { tag: string; previewRelease: string | null }) {
  return (
    <span className="flex items-center gap-2">
      <span className="font-semibold">{tag}</span>
      {tag === previewRelease && <StateTag color="bg-info">Prévia</StateTag>}
    </span>
  );
}

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

function columnsFor(
  actions: RowActions,
  previewRelease: string | null,
): ColumnDef<ReleaseRecord>[] {
  const columns: ColumnDef<ReleaseRecord>[] = [
    {
      header: 'Tag',
      accessorKey: 'tag',
      // Ordem numérica das partes (1.10.0 depois de 1.9.0), não alfabética.
      sortFn: (a, b) => a.original.tag.localeCompare(b.original.tag, 'pt-BR', { numeric: true }),
      cell: ({ row }) => <TagCell tag={row.original.tag} previewRelease={previewRelease} />,
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

/** O que a tabela mostra; sem `preview` (a tabela sem a prévia), nem tag nem aviso. */
type TableSnapshot = Omit<ReleasesSnapshot, 'preview'> & { preview: PreviewState | undefined };

/**
 * Linhas da tabela e estado da prévia: os da página até o polling trazer outros. Quando a página
 * entrega dados novos (depois de `revalidatePath` de uma ação), eles substituem os do polling. O
 * polling só roda com alguma release em `gerando` ou `baixando` ou com a prévia `atualizando`.
 */
function useReleasesSnapshot(
  rows: ReleaseRecord[],
  inUse: string[],
  preview: PreviewState | undefined,
  status: ReleasesStatus | undefined,
  pollMs: number,
): TableSnapshot {
  const [source, setSource] = useState<TableSnapshot>({ rows, inUse, preview });
  const [snapshot, setSnapshot] = useState<TableSnapshot>(source);
  if (source.rows !== rows || source.inUse !== inUse || source.preview !== preview) {
    const next = { rows, inUse, preview };
    setSource(next);
    setSnapshot(next);
  }
  const poll = useCallback(async () => {
    const next = await status?.();
    if (next !== undefined) setSnapshot(next);
  }, [status]);
  const active =
    status !== undefined &&
    (snapshot.preview?.status === 'atualizando' ||
      snapshot.rows.some((release) => IN_PIPELINE.has(release.pipelineState)));
  usePolling(active, poll, pollMs);
  return snapshot;
}

/**
 * Registro de releases (#509): tag, data de registro e estado do pipeline que gera a versão
 * (#665), no DataTable do template, como as outras listas (busca, ordem e paginação no cliente,
 * estado na URL). Com `preview`, a release no ar na prévia ganha a tag "Prévia" e o topo, o aviso
 * do estado dela (#710). Com alguma release gerando ou baixando, ou com a prévia atualizando, a
 * lista se relê sozinha. Aviso da prévia, toolbar, erro
 * das ações e tabela vão no cartão da página, abaixo do `ListHeader`; o erro fica num Alert entre
 * a toolbar e a tabela, nunca na linha (#324). Sem releases, o estado vazio com a ação.
 */
export function ReleasesTable({
  rows,
  inUse = NONE,
  preview,
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
  /** Estado da prévia; sem ele, nem a tag "Prévia" nem o aviso aparecem. */
  preview?: PreviewState;
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
  const snapshot = useReleasesSnapshot(rows, inUse, preview, status, pollMs);
  const { error, report } = useActionResult();
  // O `report` muda a cada render; a referência estável não refaz as colunas por isso.
  const onResult = useCallbackRef(report);
  const inUseSet = useMemo(() => new Set(snapshot.inUse), [snapshot.inUse]);
  const previewRelease = snapshot.preview?.currentRelease ?? null;
  const columns = useMemo(
    () => columnsFor({ retry, discard, inUse: inUseSet, onResult }, previewRelease),
    [retry, discard, inUseSet, onResult, previewRelease],
  );
  const { list, tableProps } = useListTable({ config: LIST, columns, data: snapshot.rows });
  if (snapshot.rows.length === 0) {
    return (
      <>
        <PreviewNotice preview={snapshot.preview} />
        <EmptyState action={emptyAction}>Nenhuma release registrada.</EmptyState>
      </>
    );
  }
  return (
    <>
      <PreviewNotice preview={snapshot.preview} />
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
