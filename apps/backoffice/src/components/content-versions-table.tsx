'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import Link from 'next/link';

import {
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_VARIANT,
  dateTime,
} from '@/components/site-labels.ts';
import { Badge } from '@/components/ui/badge';
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

/** Linha da tela de versões: só o que a tabela mostra (sem os dados da versão). */
export type ContentVersionRow = {
  version: number;
  status: ContentListItem['status'];
  title: string;
  createdAt: Date;
};

// TanStack Table 9: só as features usadas (nenhuma além do modelo de linhas básico).
const features = tableFeatures({});
const column = createColumnHelper<typeof features, ContentVersionRow>();

function columnsFor(siteId: string, contentId: number) {
  return column.columns([
    column.accessor('version', {
      header: 'Versão',
      cell: (info) => (
        <Link
          href={`/sites/${siteId}/conteudos/${contentId}/versoes/${info.getValue()}`}
          className="font-medium underline underline-offset-4"
        >
          Versão {info.getValue()}
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
    column.accessor('title', { header: 'Título' }),
    column.accessor('createdAt', {
      header: 'Gravada em',
      cell: (info) => dateTime.format(info.getValue()),
    }),
  ]);
}

/** Versões de um conteúdo, da primeira à mais recente, cada uma com link para lê-la. */
export function ContentVersionsTable({
  siteId,
  contentId,
  rows,
}: {
  siteId: string;
  contentId: number;
  rows: ContentVersionRow[];
}) {
  const table = useTable({ features, columns: columnsFor(siteId, contentId), data: rows });
  return (
    <Table>
      <TableCaption>{rows.length === 1 ? '1 versão' : `${rows.length} versões`}</TableCaption>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead key={header.id} scope="col">
                <table.FlexRender header={header} />
              </TableHead>
            ))}
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
