'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { EmptyState } from '@/components/empty-state';

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

/** Linha de uma lista de entidades: o servidor já formata as células como texto. */
export type EntityRow = { id: number; name: string; cells: string[] };

// TanStack Table 9: só as features usadas (nenhuma além do modelo de linhas básico).
const features = tableFeatures({});
const column = createColumnHelper<typeof features, EntityRow>();

/**
 * Lista de autores, taxonomias ou menus. Editar só aparece com `canWrite` (content.write,
 * decidido no servidor); criar é a ação do cabeçalho da página, repetida no estado vazio.
 * O domínio confere de novo ao gravar.
 */
export function EntityTable({
  basePath,
  headers,
  rows,
  noun,
  canWrite = false,
  emptyAction,
}: {
  /** `/sites/<site>/autores`: a edição é `<basePath>/<id>`. */
  basePath: string;
  /** Rótulo do nome e das demais células, na ordem. */
  headers: [string, ...string[]];
  rows: EntityRow[];
  noun: { one: string; many: string; none: string };
  canWrite?: boolean;
  /** Ação principal da tela (criar), repetida no estado vazio; só com permissão. */
  emptyAction?: ReactNode;
}) {
  const [nameHeader, ...rest] = headers;
  const columns = column.columns([
    column.accessor('name', { header: nameHeader }),
    ...rest.map((header, index) =>
      column.accessor((row) => row.cells[index] ?? '', { id: `cell-${index}`, header }),
    ),
  ]);
  const table = useTable({ features, columns, data: rows });
  if (rows.length === 0) return <EmptyState action={emptyAction}>{noun.none}</EmptyState>;
  return (
    <Table>
      <TableCaption>
        {rows.length === 1 ? `1 ${noun.one}` : `${rows.length} ${noun.many}`}
      </TableCaption>
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
                  href={`${basePath}/${row.original.id}`}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  Editar
                  <span className="sr-only"> {row.original.name}</span>
                </Link>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
