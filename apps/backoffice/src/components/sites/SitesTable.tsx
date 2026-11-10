'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, useTransition, type ReactNode } from 'react';

import { LIFECYCLE_LABEL, SITE_STATE_LABEL } from '@/components/shared/siteLabels.ts';
import {
  LastBuildSummary,
  PendingCount,
  PUBLISH_NOW_LABEL,
  PublishNowDialog,
  SiteStateIndicator,
  type PublishNow,
} from '@/components/sites/SiteStatus';
import { ActionAlert, pushSuccess, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import DataTable, { type ColumnDef, type Row } from '@/components/shared/DataTable';
import EllipsisButton from '@/components/shared/EllipsisButton';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { ROW_LINK_CLASS } from '@/components/shared/rowLink.ts';
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
  // Só Site e Status: o ícone de ordem alarga o cabeçalho, e a 1280 px a tabela não cabe com
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

/** Caracteres da versão no último build, como um hash curto; a inteira fica em `title` (#585). */
const SHORT_VERSION = 8;

/**
 * Último build: a lista mistura fusos, cada linha com a sigla; a data inteira e a versão curta
 * (#585), para o nome e o `id · domínio` caberem a 1440 px na coluna fluida, que corta o que
 * sobrar. O resto cabe a 1280 px dentro do cartão do template (#248, #364).
 */
function LastBuildCell({ build, timeZone }: { build: SiteSummary['lastBuild']; timeZone: string }) {
  return (
    <LastBuildSummary
      build={build}
      timeZone={timeZone}
      details={(version) => <span title={version}>{version.slice(0, SHORT_VERSION)}</span>}
    />
  );
}

/** "Publicar agora" da linha, no menu (#586): quem pode, o site fora da pausa e o envio. */
type RowPublish = {
  /** Abre a confirmação de "Publicar agora" do site; o foco volta a `trigger` quando ela fecha. */
  open: (siteId: string, trigger: HTMLElement | null) => void;
  /** Sites com "Publicar agora" ainda na fila. */
  pending: ReadonlySet<string>;
};

/**
 * "Mais ações" do template (`Dropdown` com o `EllipsisButton`, como no Ecme). O gatilho do
 * `renderTitle` já é o elemento focável (`role="button"`, com o nome); o `EllipsisButton` vira
 * um <span> dentro dele, para não aninhar um botão em outro. "Publicar agora", a ação que muda o
 * site no ar, fica por último, separada das que só navegam (#586); a confirmação é da tabela.
 */
function MoreActions({
  siteId,
  canConfigure,
  publish,
}: {
  siteId: string;
  canConfigure: boolean;
  publish?: RowPublish;
}) {
  const pending = publish?.pending.has(siteId) ?? false;
  // O item que abriu a confirmação some com o menu; o foco volta ao gatilho dele.
  const wrapper = useRef<HTMLSpanElement>(null);
  return (
    <span ref={wrapper} className="flex justify-end">
      <Dropdown
        aria-label={`Mais ações: ${siteId}`}
        placement="bottom-end"
        renderTitle={
          <EllipsisButton
            asElement="span"
            aria-hidden="true"
            aria-label={`Mais ações: ${siteId}`}
          />
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
        {publish && <Dropdown.Item variant="divider" />}
        {publish && (
          <Dropdown.Item
            disabled={pending}
            onClick={() =>
              publish.open(siteId, wrapper.current?.querySelector('[role="button"]') ?? null)
            }
          >
            {pending ? PUBLISH_NOW_LABEL.pending : PUBLISH_NOW_LABEL.idle}
            <span className="sr-only"> {siteId}</span>
          </Dropdown.Item>
        )}
      </Dropdown>
    </span>
  );
}

/**
 * Segunda linha do nome: o ID e o domínio, que abre o site no ar em nova aba (#586). Sem
 * domínio configurado, fica só o texto. Corta só quando falta espaço na coluna fluida (#585).
 */
function SiteIdAndDomain({ site }: { site: SiteSummary }) {
  const text = site.domain ? `${site.id} · ${site.domain}` : site.id;
  return (
    <span title={text} className="block truncate">
      {site.id}
      {site.domain && (
        <>
          {' · '}
          <a
            href={`https://${site.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-primary"
          >
            {site.domain}
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        </>
      )}
    </span>
  );
}

function columnsFor(
  publish: RowPublish | undefined,
  canConfigure: boolean,
): ColumnDef<SiteSummary>[] {
  return [
    {
      header: 'Site',
      id: 'name',
      // A busca procura no nome, no id e no domínio; a ordem é só pelo nome.
      accessorFn: (site) => `${site.name} ${site.id} ${site.domain}`,
      meta: { fluid: true },
      sortFn: byText((site) => site.name),
      cell: ({ row }) => {
        const site = row.original;
        return (
          <TwoLines secondary={<SiteIdAndDomain site={site} />}>
            <Link
              href={`/sites/${site.id}`}
              title={site.name}
              className={classNames('block truncate', ROW_LINK_CLASS)}
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
      header: 'Status',
      accessorKey: 'state',
      enableGlobalFilter: false,
      filterFn: 'equalsString',
      sortFn: byText((site) => SITE_STATE_LABEL[site.state]),
      cell: ({ row }) => <SiteStateIndicator site={row.original} compact />,
    },
    {
      header: 'Indexável',
      accessorKey: 'indexavel',
      enableGlobalFilter: false,
      enableSorting: false,
      cell: ({ row }) => (row.original.indexavel ? 'Sim' : 'Não'),
    },
    {
      header: 'Mudanças pendentes',
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
          <MoreActions
            siteId={site.id}
            canConfigure={canConfigure}
            publish={site.state === 'pausado' ? undefined : publish}
          />
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
  // Uma confirmação só para a tabela (#586): o menu fecha ao escolher o item, e o diálogo não
  // pode depender dele. `confirming` diz se está aberto; `target` guarda o site até ele fechar.
  const [target, setTarget] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [, startTransition] = useTransition();
  const returnFocus = useRef<HTMLElement | null>(null);
  const open = useCallbackRef((siteId: string, trigger: HTMLElement | null) => {
    returnFocus.current = trigger;
    setTarget(siteId);
    setConfirming(true);
  });
  const publish = useMemo<RowPublish | undefined>(
    () => (publishNow ? { open, pending } : undefined),
    [publishNow, open, pending],
  );
  const confirm = (siteId: string, action: PublishNow) => {
    setConfirming(false);
    setPending((current) => new Set(current).add(siteId));
    startTransition(async () => {
      try {
        onResult(await action(siteId));
      } finally {
        setPending((current) => {
          const next = new Set(current);
          next.delete(siteId);
          return next;
        });
      }
    });
  };
  const columns = useMemo(() => columnsFor(publish, canConfigure), [publish, canConfigure]);
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
            label: 'Status',
            value: list.state.filters.state,
            options: STATES.map((state) => ({ value: state, label: SITE_STATE_LABEL[state] })),
          },
        ]}
        onFilterChange={list.setFilter}
        onClear={list.clearFilters}
      />
      <ActionAlert error={error} />
      {publishNow && target !== null && (
        <PublishNowDialog
          siteId={target}
          isOpen={confirming}
          onCancel={() => setConfirming(false)}
          onConfirm={() => confirm(target, publishNow)}
          onAfterClose={() => returnFocus.current?.focus()}
        />
      )}
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
