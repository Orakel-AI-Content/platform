'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type Ref } from 'react';
import { TbChecks } from 'react-icons/tb';

import DataTable, { type ColumnDef, type Row } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { ROW_LINK_CLASS } from '@/components/shared/rowLink';
import {
  CONTENT_KIND_LABEL,
  formatDateTime,
  type StateTagColor,
} from '@/components/shared/siteLabels.ts';
import { NoWrap } from '@/components/shared/NoWrap';
import { Truncated } from '@/components/shared/Truncated';
import StickyFooter from '@/components/shared/StickyFooter';
import { useListTable } from '@/components/shared/useListTable';
import { StateTag } from '@/components/sites/SiteStatus';
import { Button } from '@/components/ui/Button';
import classNames from '@/components/ui/utils/classNames';
import type { ListConfig } from '@/components/shared/useListState.ts';
import type { OpinionOutlook } from '@/domain/reviews/opinions.ts';
import type { ReviewQueueEntry } from '@/domain/reviews/reviews.ts';

import {
  ApproveBatchDialog,
  contentCount,
  type ApproveBatch,
  type BatchSelection,
} from './ApproveBatchDialog.tsx';

const KINDS = Object.keys(CONTENT_KIND_LABEL) as ReviewQueueEntry['kind'][];

/** Busca por título, filtro por tipo, a mais antiga primeiro (a ordem do domínio, #74) (#365). */
const LIST: ListConfig = {
  filters: [{ column: 'kind', param: 'tipo', values: KINDS }],
  sortable: ['title', 'kind', 'version', 'pending', 'submittedAt'],
  defaultSort: { id: 'submittedAt', desc: false },
  pageSizes: [10, 25, 50, 100],
};

/** Resultado do parecer automático (#774), nas cores dos vereditos do `ReviewOpinion`. */
const OPINION: Record<OpinionOutlook, { text: string; color: StateTagColor }> = {
  favoravel: { text: 'Favorável', color: 'bg-success' },
  com_ressalvas: { text: 'Com ressalvas', color: 'bg-warning' },
  pendente: { text: 'Pendente', color: 'bg-info' },
  falha: { text: 'Falhou', color: 'bg-error' },
  ausente: { text: 'Sem parecer', color: 'bg-gray-400' },
};

/** Ordena pelo texto exibido em pt-BR (rótulo do tipo, título), não pelo valor. */
function byText(text: (item: ReviewQueueEntry) => string) {
  return (a: Row<ReviewQueueEntry>, b: Row<ReviewQueueEntry>) =>
    text(a.original).localeCompare(text(b.original), 'pt-BR');
}

function columnsFor(siteId: string, timeZone: string): ColumnDef<ReviewQueueEntry>[] {
  return [
    {
      header: 'Título',
      accessorKey: 'title',
      meta: { fluid: true },
      sortFn: byText((item) => item.title),
      // A marca fica fora do link: o nome acessível continua o título (#772). A versão da
      // correção automática também voltou da devolução, mas leva a marca mais específica (#804).
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-2">
          <Link
            href={`/sites/${siteId}/revisao/${row.original.id}`}
            className={classNames(ROW_LINK_CLASS, 'min-w-0')}
          >
            <Truncated text={row.original.title} />
            <span className="sr-only"> (revisar)</span>
          </Link>
          {row.original.autoCorrected ? (
            <StateTag color="bg-info" className="shrink-0">
              Correção automática
            </StateTag>
          ) : (
            row.original.returned && (
              <StateTag color="bg-warning" className="shrink-0">
                Devolvido
              </StateTag>
            )
          )}
        </span>
      ),
    },
    {
      header: 'Tipo',
      accessorKey: 'kind',
      meta: { hideBelow: 'md' },
      enableGlobalFilter: false,
      filterFn: 'equalsString',
      sortFn: byText((item) => CONTENT_KIND_LABEL[item.kind]),
      cell: ({ row }) => CONTENT_KIND_LABEL[row.original.kind],
    },
    {
      header: 'Versão',
      accessorKey: 'version',
      meta: { hideBelow: 'md' },
      enableGlobalFilter: false,
      sortFn: 'basic',
    },
    // Itens da revisão que não estão ok, contados como na tela de revisão (#772).
    {
      header: 'Pendências',
      accessorKey: 'pending',
      enableGlobalFilter: false,
      sortFn: 'basic',
      cell: ({ row }) => (row.original.pending === 0 ? 'Nenhuma' : row.original.pending),
    },
    // Parecer automático da versão em revisão (#774): só informa, como na tela de revisão.
    {
      header: 'Parecer',
      accessorKey: 'opinion',
      enableGlobalFilter: false,
      enableSorting: false,
      cell: ({ row }) => {
        const { text, color } = OPINION[row.original.opinion];
        return (
          <StateTag color={color} className="whitespace-nowrap">
            {text}
          </StateTag>
        );
      },
    },
    // Instante do envio para revisão (#771); a data da versão nas anteriores à coluna.
    {
      header: 'Enviado em',
      accessorKey: 'submittedAt',
      enableGlobalFilter: false,
      sortFn: 'datetime',
      cell: ({ row }) => <NoWrap>{formatDateTime(row.original.submittedAt, timeZone)}</NoWrap>,
    },
  ];
}

/**
 * Barra dos selecionados, como a `ProductListSelected` do Ecme e a `ContentsSelected` da lista de
 * conteúdos (#495): aparece com a seleção, no `StickyFooter`, com a quantidade e a ação do lote.
 */
function ReviewSelected({
  total,
  trigger,
  onApprove,
}: {
  total: number;
  trigger: Ref<HTMLButtonElement>;
  onApprove: () => void;
}) {
  return (
    <StickyFooter
      className="flex items-center justify-between py-4 bg-white dark:bg-gray-800"
      stickyClass="bottom-0 border-t border-gray-200 dark:border-gray-700 px-4"
      defaultClass="rounded-xl border border-gray-200 dark:border-gray-600 px-4"
    >
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="text-lg text-primary" aria-hidden>
            <TbChecks />
          </span>
          <span className="font-semibold heading-text">
            {total === 1 ? '1 conteúdo selecionado' : `${contentCount(total)} selecionados`}
          </span>
        </span>
        <Button
          ref={trigger}
          type="button"
          size="sm"
          variant="solid"
          aria-haspopup="dialog"
          onClick={onApprove}
        >
          Aprovar e publicar selecionados
        </Button>
      </div>
    </StickyFooter>
  );
}

/**
 * Fila de revisão do site (#74): conteúdos cuja versão mais recente está em revisão, da mais
 * antiga para a mais recente. Cada título leva à tela de revisão, com a marca "Devolvido" ao
 * lado quando volta de uma devolução, "Pendências" conta o que não está ok (#772) e "Parecer" mostra o
 * resultado do parecer automático (#774). No DataTable do template
 * (#365): busca por título, filtro por tipo, ordem e paginação no cliente com o estado na URL;
 * toolbar e tabela vão no cartão da página, abaixo do `ListHeader`. Com `canPublish`
 * (content.publish, decidido no servidor) e a ação, os itens elegíveis para o lote ganham caixa de
 * seleção, e a barra dos selecionados abre o resumo do lote (#776). Os outros têm a caixa
 * desabilitada, com os motivos do domínio (`batchBlockers`). A seleção vale para a página visível
 * e zera quando ela muda e depois do envio, como na lista de conteúdos.
 */
export function ReviewQueueTable({
  siteId,
  timeZone,
  rows,
  canPublish = false,
  approveBatchAction,
  labelledBy,
}: {
  siteId: string;
  /** Fuso do site (`SiteSummary.timeZone`): as datas aparecem nele. */
  timeZone: string;
  rows: ReviewQueueEntry[];
  /** content.publish, decidido no servidor: seleção e lote de aprovar e publicar. */
  canPublish?: boolean;
  approveBatchAction?: ApproveBatch;
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
}) {
  const columns = useMemo(() => columnsFor(siteId, timeZone), [siteId, timeZone]);
  const { list, tableProps } = useListTable({ config: LIST, columns, data: rows });
  const [selection, setSelection] = useState<{ page: string; ids: number[] }>({
    page: '',
    ids: [],
  });
  const [summary, setSummary] = useState<{ open: boolean; items: BatchSelection[] }>({
    open: false,
    items: [],
  });
  const trigger = useRef<HTMLButtonElement>(null);

  const selectable = canPublish && approveBatchAction !== undefined;
  const eligible = tableProps.data.filter((item) => item.batchBlockers.length === 0);
  // A seleção é da página visível: outra página, busca ou filtro mudam o conjunto e a zeram.
  const page = eligible
    .map((item) => item.id)
    .sort((a, b) => a - b)
    .join(',');
  const selected =
    selection.page === page ? eligible.filter((item) => selection.ids.includes(item.id)) : [];
  const select = (ids: number[]) => setSelection({ page, ids });

  if (rows.length === 0) {
    return <EmptyState>Nenhum conteúdo aguardando revisão.</EmptyState>;
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
        ]}
        onFilterChange={list.setFilter}
        onClear={list.clearFilters}
      />
      <DataTable
        compact
        aria-labelledby={labelledBy}
        instanceId="review-queue-table"
        columns={columns}
        customNoDataIcon={<NoResults>Nenhum conteúdo encontrado.</NoResults>}
        {...tableProps}
        {...(selectable
          ? {
              selectable: true,
              rowSelectable: (item: ReviewQueueEntry) => item.batchBlockers.length === 0,
              rowUnselectableReason: (item: ReviewQueueEntry) =>
                `Fora do lote: ${item.batchBlockers.join('; ')}.`,
              checkboxLabel: (item: ReviewQueueEntry) => `Selecionar ${item.title}`,
              checkboxChecked: (item: ReviewQueueEntry) =>
                selected.some((chosen) => chosen.id === item.id),
              indeterminateCheckboxChecked: () =>
                eligible.length > 0 && selected.length === eligible.length,
              onCheckBoxChange: (checked: boolean, item: ReviewQueueEntry) =>
                select(
                  checked
                    ? [...selected.map((chosen) => chosen.id), item.id]
                    : selected.map((chosen) => chosen.id).filter((id) => id !== item.id),
                ),
              onIndeterminateCheckBoxChange: (checked: boolean) =>
                select(checked ? eligible.map((item) => item.id) : []),
            }
          : {})}
      />
      {selectable && (
        <>
          {selected.length > 0 && (
            <ReviewSelected
              total={selected.length}
              trigger={trigger}
              onApprove={() =>
                setSummary({
                  open: true,
                  items: selected.map(({ id, version, title }) => ({ id, version, title })),
                })
              }
            />
          )}
          <ApproveBatchDialog
            siteId={siteId}
            isOpen={summary.open}
            items={summary.items}
            action={approveBatchAction}
            onClose={(sent) => {
              setSummary((current) => ({ ...current, open: false }));
              if (sent) select([]);
            }}
            // Depois do envio, a barra some com a seleção: o foco vai ao título da lista.
            onAfterClose={() => {
              if (trigger.current?.isConnected) return;
              const heading = labelledBy ? document.getElementById(labelledBy) : null;
              if (heading === null) return;
              heading.tabIndex = -1;
              heading.focus();
            }}
          />
        </>
      )}
    </>
  );
}
