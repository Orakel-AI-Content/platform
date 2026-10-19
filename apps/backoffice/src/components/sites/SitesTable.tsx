'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import {
  LIFECYCLE_LABEL,
  SITE_STATE_LABEL,
  SITE_STATE_VARIANT,
} from '@/components/shared/siteLabels.ts';
import {
  LastBuildSummary,
  PendingCount,
  PublishNowButton,
  PublishStatusRegion,
  StateTag,
  type PublishNow,
  type PublishStatus,
} from '@/components/sites/SiteStatus';
import { EmptyState } from '@/components/shared/EmptyState';
import Dropdown from '@/components/ui/Dropdown';
import Table from '@/components/ui/Table';
import classNames from '@/components/ui/utils/classNames';
import type { SiteSummary } from '@/domain/sites/sites.ts';

// TanStack Table 9: só as features usadas (nenhuma além do modelo de linhas básico).
const features = tableFeatures({});
const column = createColumnHelper<typeof features, SiteSummary>();
const { THead, TBody, Tr, Th, Td } = Table;

/**
 * Gatilho do "Mais ações" com a aparência do `Button` default `xs` do Ecme (`Button.tsx`): o
 * Dropdown desenha o próprio <button>, que não é o do Button.
 */
const ACTIONS_TOGGLE_CLASS =
  'button h-8 rounded-lg px-3 py-1 text-xs bg-white border border-gray-300 text-gray-600 dark:bg-gray-700 dark:border-gray-700 dark:text-gray-100 ring-primary dark:ring-white hover:border-primary dark:hover:border-white hover:ring-1 hover:text-primary dark:hover:text-white dark:hover:bg-transparent';

/** Duas linhas numa célula: a principal e a secundária, menor; nenhuma quebra além delas. */
function TwoLines({ children, secondary }: { children: ReactNode; secondary?: ReactNode }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span>{children}</span>
      {secondary !== undefined && <span className="text-xs">{secondary}</span>}
    </span>
  );
}

/** Texto cortado numa largura máxima, com o texto inteiro em `title`. */
function Truncated({ text, className }: { text: string; className: string }) {
  return (
    <span title={text} className={classNames('block truncate', className)}>
      {text}
    </span>
  );
}

/** Último build: a lista mistura fusos, cada linha com a sigla; data e versão cortadas. */
function LastBuildCell({ build, timeZone }: { build: SiteSummary['lastBuild']; timeZone: string }) {
  return (
    <LastBuildSummary
      build={build}
      timeZone={timeZone}
      details={(text) => <Truncated text={text} className="max-w-32" />}
    />
  );
}

const columns = column.columns([
  column.accessor('name', {
    header: 'Site',
    cell: (info) => {
      const site = info.row.original;
      return (
        <TwoLines
          secondary={<Truncated text={`${site.id} · ${site.domain}`} className="max-w-40" />}
        >
          <Link
            href={`/sites/${site.id}`}
            title={site.name}
            className="block max-w-40 truncate font-semibold text-gray-900 underline underline-offset-4 hover:text-primary dark:text-gray-100"
          >
            {site.name}
          </Link>
        </TwoLines>
      );
    },
  }),
  column.accessor('lifecycle', {
    header: 'Ciclo de vida',
    cell: (info) => {
      const release = info.row.original.release;
      return (
        <TwoLines secondary={release ? `Release ${release}` : 'Sem release'}>
          {LIFECYCLE_LABEL[info.getValue()]}
        </TwoLines>
      );
    },
  }),
  column.accessor('state', {
    header: 'Estado',
    cell: (info) => {
      const site = info.row.original;
      const reason = site.state === 'pausado' ? site.pausedReason : null;
      return (
        <TwoLines secondary={reason ? <Truncated text={reason} className="max-w-28" /> : undefined}>
          <StateTag color={SITE_STATE_VARIANT[site.state]}>{SITE_STATE_LABEL[site.state]}</StateTag>
        </TwoLines>
      );
    },
  }),
  column.accessor('indexavel', {
    header: 'Indexável',
    cell: (info) => (info.getValue() ? 'Sim' : 'Não'),
  }),
  column.accessor('pendingChanges', {
    header: 'Pendências',
    cell: (info) => <PendingCount siteId={info.row.original.id} count={info.getValue()} />,
  }),
  column.accessor('lastBuild', {
    header: 'Último build',
    cell: (info) => <LastBuildCell build={info.getValue()} timeZone={info.row.original.timeZone} />,
  }),
]);

/** Registro de instâncias em tabela (TanStack Table + Table do Ecme, `compact`). */
export function SitesTable({
  rows,
  publishNow,
  canConfigure = false,
  emptyAction,
  created,
}: {
  rows: SiteSummary[];
  publishNow?: PublishNow;
  canConfigure?: boolean;
  /** Ação principal da tela (cadastrar site), repetida no estado vazio; só com permissão. */
  emptyAction?: ReactNode;
  /** Site recém-cadastrado (`?cadastrado=<id>`): anuncia a confirmação e tira a marca da URL. */
  created?: string;
}) {
  const table = useTable({ features, columns, data: rows });
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<PublishStatus | null>(null);

  // No quadro seguinte à montagem: texto já presente quando a região `role="status"` aparece
  // não é anunciado; a mudança depois de montar é (mesmo mecanismo do #109).
  useEffect(() => {
    if (created === undefined) return;
    const frame = requestAnimationFrame(() =>
      setStatus({ ok: true, message: `Site ${created} cadastrado.` }),
    );
    router.replace(pathname, { scroll: false });
    return () => cancelAnimationFrame(frame);
  }, [created, pathname, router]);
  if (rows.length === 0) {
    return <EmptyState action={emptyAction}>Nenhum site cadastrado.</EmptyState>;
  }
  return (
    <div className="space-y-2">
      {/* Uma região para a tabela inteira: o retorno de "Publicar agora" não cresce a linha. */}
      <PublishStatusRegion status={status} />
      <Table compact>
        <caption className="mt-4 caption-bottom text-sm">
          {rows.length === 1 ? '1 site' : `${rows.length} sites`}
        </caption>
        <THead>
          {table.getHeaderGroups().map((group) => (
            <Tr key={group.id}>
              {group.headers.map((header) => (
                <Th key={header.id}>
                  <table.FlexRender header={header} />
                </Th>
              ))}
              <Th>
                <span className="sr-only">Ações</span>
              </Th>
            </Tr>
          ))}
        </THead>
        <TBody>
          {table.getRowModel().rows.map((row) => {
            const siteId = row.original.id;
            return (
              <Tr key={row.id}>
                {row.getAllCells().map((cell) => (
                  <Td key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </Td>
                ))}
                <Td>
                  {/* Um botão sob o outro: lado a lado, a coluna não cabe a 1280 px (#248). */}
                  <span className="flex flex-col items-end gap-1">
                    {publishNow && row.original.state !== 'pausado' && (
                      <PublishNowButton
                        siteId={siteId}
                        action={publishNow}
                        onResult={setStatus}
                        size="xs"
                      />
                    )}
                    <Dropdown
                      title="Mais ações"
                      aria-label={`Mais ações: ${siteId}`}
                      placement="bottom-end"
                      toggleClassName={ACTIONS_TOGGLE_CLASS}
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
                  </span>
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
