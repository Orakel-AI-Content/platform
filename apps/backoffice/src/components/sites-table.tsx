'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import Link from 'next/link';
import { useState, useTransition, type ReactNode } from 'react';

import {
  BUILD_STATUS_LABEL,
  BUILD_STATUS_VARIANT,
  formatDateTime,
  LIFECYCLE_LABEL,
  SITE_STATE_LABEL,
  SITE_STATE_VARIANT,
} from '@/components/site-labels.ts';
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

type PublishStatus = { ok: boolean; message: string };
type PublishNow = (siteId: string) => Promise<PublishStatus>;

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

/** Último build no fuso do próprio site: a lista mistura fusos, cada linha com a sigla (#90). */
function LastBuildCell({ build, timeZone }: { build: SiteSummary['lastBuild']; timeZone: string }) {
  if (build === null) return <span className="text-muted-foreground">—</span>;
  const when = `${formatDateTime(new Date(build.finishedAt), timeZone)}${build.versionId ? ` · ${build.versionId}` : ''}`;
  return (
    <TwoLines secondary={<Truncated text={when} className="max-w-40" />}>
      <Badge variant={BUILD_STATUS_VARIANT[build.status]}>{BUILD_STATUS_LABEL[build.status]}</Badge>
    </TwoLines>
  );
}

/**
 * Enfileira o build já. O retorno vai para a região `role="status"` da tabela, não para a
 * linha: a mensagem não aumenta a altura dela.
 */
function PublishNowButton({
  siteId,
  action,
  onResult,
}: {
  siteId: string;
  action: PublishNow;
  onResult: (status: PublishStatus) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => onResult(await action(siteId)))}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      {pending ? 'Enfileirando…' : 'Publicar agora'}
      <span className="sr-only"> {siteId}</span>
    </button>
  );
}

/** Pendências maiores que 0 se destacam e levam à tela de pendências do site (#99). */
function PendingCell({ siteId, count }: { siteId: string; count: number }) {
  if (count === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <Link href={`/sites/${siteId}/pendencias`} className="inline-flex rounded-md">
      <Badge variant="warning" className="underline underline-offset-4">
        {count}
        <span className="sr-only">
          {' '}
          {count === 1 ? 'mudança pendente' : 'mudanças pendentes'} em {siteId}
        </span>
      </Badge>
    </Link>
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
        <TwoLines secondary={reason ? <Truncated text={reason} className="max-w-32" /> : undefined}>
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
    cell: (info) => <PendingCell siteId={info.row.original.id} count={info.getValue()} />,
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
      <p
        role="status"
        className={
          status?.ok === false ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
        }
      >
        {status?.message}
      </p>
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
