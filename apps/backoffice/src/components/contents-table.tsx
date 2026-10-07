'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { EmptyState } from '@/components/empty-state';

import {
  CONTENT_KIND_LABEL,
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_VARIANT,
  dateTime,
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
import type { ContentListItem } from '@/domain/content/contents.ts';

// TanStack Table 9: só as features usadas (nenhuma além do modelo de linhas básico).
const features = tableFeatures({});
const column = createColumnHelper<typeof features, ContentListItem>();

function columnsFor(siteId: string) {
  return column.columns([
    column.accessor('kind', {
      header: 'Tipo',
      cell: (info) => CONTENT_KIND_LABEL[info.getValue()],
    }),
    column.accessor('title', {
      header: 'Título',
      cell: (info) => (
        <Link
          href={`/sites/${siteId}/conteudos/${info.row.original.id}`}
          className="font-medium underline underline-offset-4"
        >
          {info.getValue()}
          <span className="sr-only"> (versões)</span>
        </Link>
      ),
    }),
    column.accessor('status', {
      header: 'Status',
      cell: (info) => (
        <Badge variant={CONTENT_STATUS_VARIANT[info.getValue()]}>
          {CONTENT_STATUS_LABEL[info.getValue()]}
        </Badge>
      ),
    }),
    column.accessor('version', { header: 'Versão' }),
    column.accessor('updatedAt', {
      header: 'Última alteração',
      cell: (info) => dateTime.format(info.getValue()),
    }),
  ]);
}

/**
 * Conteúdos de um site com a versão mais recente de cada um. Editar só aparece com
 * `canWrite` (content.write, decidido no servidor); criar é a ação do cabeçalho da página,
 * repetida no estado vazio. As rotas são do editor (#45).
 */
export function ContentsTable({
  siteId,
  rows,
  canWrite = false,
  emptyAction,
}: {
  siteId: string;
  rows: ContentListItem[];
  canWrite?: boolean;
  /** Ação principal da tela (criar conteúdo), repetida no estado vazio; só com permissão. */
  emptyAction?: ReactNode;
}) {
  const columns = columnsFor(siteId);
  const table = useTable({ features, columns, data: rows });
  if (rows.length === 0) {
    return <EmptyState action={emptyAction}>Nenhum conteúdo cadastrado.</EmptyState>;
  }
  return (
    <Table>
      <TableCaption>{rows.length === 1 ? '1 conteúdo' : `${rows.length} conteúdos`}</TableCaption>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead key={header.id} scope="col">
                <table.FlexRender header={header} />
              </TableHead>
            ))}
            {canWrite && (
              <TableHead scope="col">
                <span className="sr-only">Ações</span>
              </TableHead>
            )}
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
            {canWrite && (
              <TableCell>
                <Link
                  href={`/sites/${siteId}/conteudos/${row.original.id}/editar`}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  Editar
                  <span className="sr-only"> {row.original.title}</span>
                </Link>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
