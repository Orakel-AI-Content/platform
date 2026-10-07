'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import {
  BUILD_STATUS_LABEL,
  BUILD_STATUS_VARIANT,
  LIFECYCLE_LABEL,
  SITE_STATE_LABEL,
  SITE_STATE_VARIANT,
} from '@/components/site-labels.ts';
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

// TanStack Table 9: só as features usadas (nenhuma além do modelo de linhas básico).
const features = tableFeatures({});
const column = createColumnHelper<typeof features, SiteSummary>();

type PublishNow = (siteId: string) => Promise<{ ok: boolean; message: string }>;

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

function LastBuildCell({ build }: { build: SiteSummary['lastBuild'] }) {
  if (build === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <Badge variant={BUILD_STATUS_VARIANT[build.status]}>{BUILD_STATUS_LABEL[build.status]}</Badge>
      <span className="text-xs text-muted-foreground">
        {dateTime.format(new Date(build.finishedAt))}
        {build.versionId ? ` · ${build.versionId}` : ''}
      </span>
    </span>
  );
}

/** Enfileira o build já, com o retorno anunciado para leitores de tela. */
function PublishNowButton({ siteId, action }: { siteId: string; action: PublishNow }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setStatus(await action(siteId)))}
        className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {pending ? 'Enfileirando…' : 'Publicar agora'}
        <span className="sr-only"> {siteId}</span>
      </button>
      <span
        role="status"
        className={
          status?.ok === false ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
        }
      >
        {status?.message}
      </span>
    </span>
  );
}

const columns = column.columns([
  column.accessor('id', {
    header: 'SITE_ID',
    cell: (info) => (
      <Link href={`/sites/${info.getValue()}`} className="font-medium underline underline-offset-4">
        {info.getValue()}
      </Link>
    ),
  }),
  column.accessor('name', { header: 'Nome' }),
  column.accessor('domain', { header: 'Domínio' }),
  column.accessor('lifecycle', {
    header: 'Ciclo de vida',
    cell: (info) => LIFECYCLE_LABEL[info.getValue()],
  }),
  column.accessor('state', {
    header: 'Estado',
    cell: (info) => {
      const site = info.row.original;
      const reason = site.state === 'pausado' ? site.pausedReason : null;
      return (
        <Badge variant={SITE_STATE_VARIANT[site.state]} title={reason ?? undefined}>
          {SITE_STATE_LABEL[site.state]}
          {reason ? `: ${reason}` : ''}
        </Badge>
      );
    },
  }),
  column.accessor('release', { header: 'Release', cell: (info) => info.getValue() ?? '—' }),
  column.accessor('indexavel', {
    header: 'Indexável',
    cell: (info) => (info.getValue() ? 'Sim' : 'Não'),
  }),
  column.accessor('pendingChanges', { header: 'Mudanças pendentes' }),
  column.accessor('lastBuild', {
    header: 'Último build',
    cell: (info) => <LastBuildCell build={info.getValue()} />,
  }),
]);

/** Registro de instâncias em tabela (TanStack Table + tabela do shadcn/ui). */
export function SitesTable({
  rows,
  publishNow,
  canConfigure = false,
}: {
  rows: SiteSummary[];
  publishNow?: PublishNow;
  canConfigure?: boolean;
}) {
  const table = useTable({ features, columns, data: rows });
  const colSpan = columns.length + 1;
  return (
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
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id}>
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
            <TableCell>
              <span className="flex flex-col items-start gap-2">
                <Link
                  href={`/sites/${row.original.id}/conteudos`}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  Conteúdos
                  <span className="sr-only"> {row.original.id}</span>
                </Link>
                <Link
                  href={`/sites/${row.original.id}/midia`}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  Mídia
                  <span className="sr-only"> {row.original.id}</span>
                </Link>
                {canConfigure && (
                  <Link
                    href={`/sites/${row.original.id}/configuracao`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    Editar configuração
                    <span className="sr-only"> {row.original.id}</span>
                  </Link>
                )}
                {publishNow && row.original.state !== 'pausado' && (
                  <PublishNowButton siteId={row.original.id} action={publishNow} />
                )}
              </span>
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
              Nenhum site cadastrado.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
