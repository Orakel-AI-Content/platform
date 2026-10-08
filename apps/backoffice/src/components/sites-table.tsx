'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { LIFECYCLE_LABEL, SITE_STATE_LABEL, SITE_STATE_VARIANT } from '@/components/site-labels.ts';
import {
  LastBuildSummary,
  PendingCount,
  PublishNowButton,
  PublishStatusRegion,
  type PublishNow,
  type PublishStatus,
} from '@/components/site-status';
import { EmptyState } from '@/components/empty-state';
import { ActionsMenu } from '@/components/ui/actions-menu';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SiteSummary } from '@/domain/sites/sites.ts';
import { cn } from '@/lib/utils';

// TanStack Table 9: só as features usadas (nenhuma além do modelo de linhas básico).
const features = tableFeatures({});
const column = createColumnHelper<typeof features, SiteSummary>();

/** Duas linhas numa célula: a principal e a secundária, menor; nenhuma quebra além delas. */
function TwoLines({ children, secondary }: { children: ReactNode; secondary?: ReactNode }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span>{children}</span>
      {secondary !== undefined && (
        <span className="text-xs text-muted-foreground">{secondary}</span>
      )}
    </span>
  );
}

/** Texto cortado numa largura máxima, com o texto inteiro em `title`. */
function Truncated({ text, className }: { text: string; className: string }) {
  return (
    <span title={text} className={`block truncate ${className}`}>
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
      details={(text) => <Truncated text={text} className="max-w-44" />}
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
          secondary={<Truncated text={`${site.id} · ${site.domain}`} className="max-w-48" />}
        >
          <Link
            href={`/sites/${site.id}`}
            title={site.name}
            className="block max-w-48 truncate font-medium underline underline-offset-4"
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
        <TwoLines secondary={reason ? <Truncated text={reason} className="max-w-36" /> : undefined}>
          <Badge variant={SITE_STATE_VARIANT[site.state]}>{SITE_STATE_LABEL[site.state]}</Badge>
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

/** Registro de instâncias em tabela (TanStack Table + tabela do shadcn/ui). */
export function SitesTable({
  rows,
  publishNow,
  canConfigure = false,
  emptyAction,
}: {
  rows: SiteSummary[];
  publishNow?: PublishNow;
  canConfigure?: boolean;
  /** Ação principal da tela (cadastrar site), repetida no estado vazio; só com permissão. */
  emptyAction?: ReactNode;
}) {
  const table = useTable({ features, columns, data: rows });
  const [status, setStatus] = useState<PublishStatus | null>(null);
  if (rows.length === 0) {
    return <EmptyState action={emptyAction}>Nenhum site cadastrado.</EmptyState>;
  }
  const item = cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'justify-start');
  return (
    <div className="space-y-2">
      {/* Uma região para a tabela inteira: o retorno de "Publicar agora" não cresce a linha. */}
      <PublishStatusRegion status={status} />
      <Table>
        <TableCaption>{rows.length === 1 ? '1 site' : `${rows.length} sites`}</TableCaption>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id} scope="col">
                  <table.FlexRender header={header} />
                </TableHead>
              ))}
              <TableHead scope="col">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const siteId = row.original.id;
            return (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
                <TableCell>
                  <span className="flex items-center gap-2">
                    {publishNow && row.original.state !== 'pausado' && (
                      <PublishNowButton siteId={siteId} action={publishNow} onResult={setStatus} />
                    )}
                    <ActionsMenu label={siteId}>
                      <Link href={`/sites/${siteId}/conteudos`} className={item}>
                        Conteúdos<span className="sr-only"> {siteId}</span>
                      </Link>
                      <Link href={`/sites/${siteId}/midia`} className={item}>
                        Mídia<span className="sr-only"> {siteId}</span>
                      </Link>
                      {canConfigure && (
                        <Link href={`/sites/${siteId}/configuracao`} className={item}>
                          Editar configuração<span className="sr-only"> {siteId}</span>
                        </Link>
                      )}
                    </ActionsMenu>
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
