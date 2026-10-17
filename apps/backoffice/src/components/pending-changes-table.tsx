'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { formatDateTime, PENDING_ORIGIN_LABEL, pendingItem } from '@/components/site-labels.ts';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/legacy-ui/table';
import type { PendingChange } from '@/domain/pending-changes/list.ts';

// TanStack Table 9: só as features usadas (nenhuma além do modelo de linhas básico).
const features = tableFeatures({});
const column = createColumnHelper<typeof features, PendingChange>();

function columnsFor(siteId: string, timeZone: string) {
  return column.columns([
    column.accessor('origin', {
      header: 'Origem',
      cell: (info) => PENDING_ORIGIN_LABEL[info.getValue()],
    }),
    column.accessor('reference', {
      header: 'Item',
      cell: (info) => {
        const item = pendingItem(siteId, info.row.original.origin, info.getValue());
        return item.href ? (
          <Link href={item.href} className="underline underline-offset-4">
            {item.text}
          </Link>
        ) : (
          item.text
        );
      },
    }),
    column.accessor('createdAt', {
      header: 'Registrada em',
      cell: (info) => formatDateTime(info.getValue(), timeZone),
    }),
  ]);
}

/**
 * Mudanças do site ainda não publicadas (#99), só leitura: origem, item (com link para a tela
 * dele, quando há) e data no fuso do site. Sem pendências, o estado vazio.
 */
export function PendingChangesTable({
  siteId,
  timeZone,
  rows,
}: {
  siteId: string;
  /** Fuso do site (`SiteSummary.timeZone`): as datas aparecem nele. */
  timeZone: string;
  rows: PendingChange[];
}) {
  const table = useTable({ features, columns: columnsFor(siteId, timeZone), data: rows });
  if (rows.length === 0) {
    return <EmptyState>Nenhuma mudança pendente: o site publicado está em dia.</EmptyState>;
  }
  return (
    <Table>
      <TableCaption>
        {rows.length === 1 ? '1 mudança pendente' : `${rows.length} mudanças pendentes`}
      </TableCaption>
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
