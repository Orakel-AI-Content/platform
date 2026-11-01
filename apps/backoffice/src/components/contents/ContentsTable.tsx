'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { TbChecks, TbPencil } from 'react-icons/tb';

import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog, {
  dangerButtonClass,
  dangerConfirmButtonProps,
} from '@/components/shared/ConfirmDialog.tsx';
import DataTable, { type ColumnDef, type Row } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { IconButton } from '@/components/shared/IconButton';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { ROW_LINK_CLASS } from '@/components/shared/rowLink';
import StickyFooter from '@/components/shared/StickyFooter';
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
import { Button } from '@/components/ui/Button';
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
          <span className="sr-only"> (ver versões)</span>
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
      enableSorting: false,
      // Na largura do botão de ícone, como no `CustomerListTable` do Ecme.
      size: 1,
      cell: ({ row }) => (
        <IconButton
          asElement={Link}
          href={`/sites/${siteId}/conteudos/${row.original.id}/editar`}
          label={`Editar ${row.original.title}`}
          icon={<TbPencil />}
        />
      ),
    },
  ];
}

/** Server Action da despublicação em massa (`unpublishContentsAction`). */
export type UnpublishContents = (siteId: string, contentIds: number[]) => Promise<ActionResult>;

const count = new Intl.NumberFormat('pt-BR');

/** "1 conteúdo", "12 conteúdos". */
const contentCount = (total: number) =>
  total === 1 ? '1 conteúdo' : `${count.format(total)} conteúdos`;

/**
 * Barra dos selecionados, como a `ProductListSelected` do Ecme: aparece com a seleção, no
 * `StickyFooter`, com a quantidade e a ação destrutiva, confirmada no `ConfirmDialog` danger.
 * Adaptado (#495): dentro do cartão da lista (a seleção é estado da tabela), sem o `-mx` e o
 * `container` que o Ecme usa fora dele; textos em pt-BR.
 */
function ContentsSelected({
  total,
  pending,
  onConfirm,
}: {
  total: number;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      {total > 0 && (
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
              <span className="font-semibold flex items-center gap-1">
                <span className="heading-text">
                  {total === 1
                    ? '1 conteúdo selecionado'
                    : `${count.format(total)} conteúdos selecionados`}
                </span>
              </span>
            </span>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              customColorClass={dangerButtonClass}
              onClick={() => setConfirming(true)}
            >
              {pending ? 'Despublicando…' : 'Despublicar em massa'}
            </Button>
          </div>
        </StickyFooter>
      )}
      <ConfirmDialog
        isOpen={confirming}
        type="danger"
        title={`Despublicar ${contentCount(total)}?`}
        confirmText="Despublicar"
        confirmButtonProps={dangerConfirmButtonProps}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        <p>
          {total === 1 ? 'O conteúdo sai do ar' : `Os ${contentCount(total)} saem do ar`} no próximo
          build, sem redirecionamento: os endereços passam a responder 404. A trava de queda de
          páginas fica liberada nesse build.
        </p>
      </ConfirmDialog>
    </>
  );
}

/**
 * Conteúdos de um site com a versão mais recente de cada um, com busca por título, filtros
 * por tipo e status, ordenação e paginação no cliente e o estado na URL (#107), no DataTable
 * do template (#362): toolbar e tabela vão no cartão da página, abaixo do `ListHeader`. Editar só
 * aparece com `canWrite` (content.write, decidido no servidor); criar é a ação do cabeçalho
 * da página, repetida no estado vazio. As rotas são do editor (#45). Com `canPublish`
 * (content.publish) e a ação, os conteúdos no ar da página ganham caixa de seleção e a barra dos
 * selecionados despublica em massa (#495); a seleção vale para a página visível e zera quando
 * ela muda (página, busca, filtro) e depois do sucesso.
 */
export function ContentsTable({
  siteId,
  timeZone,
  rows,
  canWrite = false,
  canPublish = false,
  unpublishAction,
  emptyAction,
  labelledBy,
}: {
  siteId: string;
  /** Fuso do site (`SiteSummary.timeZone`): as datas aparecem nele. */
  timeZone: string;
  rows: ContentListItem[];
  canWrite?: boolean;
  /** content.publish, decidido no servidor: seleção e despublicação em massa. */
  canPublish?: boolean;
  unpublishAction?: UnpublishContents;
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
  const [selection, setSelection] = useState<{ page: string; ids: number[] }>({
    page: '',
    ids: [],
  });
  const { pending, error, run } = useActionResult();

  const selectable = canPublish && unpublishAction !== undefined;
  const live = tableProps.data.filter((item) => item.live);
  // A seleção é da página visível: outra página, busca ou filtro mudam o conjunto e a zeram.
  const page = live
    .map((item) => item.id)
    .sort((a, b) => a - b)
    .join(',');
  const selected =
    selection.page === page ? live.filter((item) => selection.ids.includes(item.id)) : [];
  const select = (ids: number[]) => setSelection({ page, ids });

  const unpublish = () => {
    if (unpublishAction === undefined) return;
    const ids = selected.map((item) => item.id);
    run(async () => {
      const result = await unpublishAction(siteId, ids);
      if (result.ok) select([]);
      return result;
    });
  };

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
        {...(selectable
          ? {
              selectable: true,
              rowSelectable: (item: ContentListItem) => item.live,
              checkboxLabel: (item: ContentListItem) => `Selecionar ${item.title}`,
              checkboxChecked: (item: ContentListItem) =>
                selected.some((chosen) => chosen.id === item.id),
              indeterminateCheckboxChecked: () =>
                live.length > 0 && selected.length === live.length,
              onCheckBoxChange: (checked: boolean, item: ContentListItem) =>
                select(
                  checked
                    ? [...selected.map((chosen) => chosen.id), item.id]
                    : selected.map((chosen) => chosen.id).filter((id) => id !== item.id),
                ),
              onIndeterminateCheckBoxChange: (checked: boolean) =>
                select(checked ? live.map((item) => item.id) : []),
            }
          : {})}
      />
      {selectable && (
        <>
          <ActionAlert error={error} />
          <ContentsSelected total={selected.length} pending={pending} onConfirm={unpublish} />
        </>
      )}
    </>
  );
}
