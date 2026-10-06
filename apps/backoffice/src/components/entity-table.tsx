'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import Link from 'next/link';

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
 * Lista de autores, taxonomias ou menus. Criar e editar só aparecem com `canWrite`
 * (content.write, decidido no servidor); o domínio confere de novo ao gravar.
 */
export function EntityTable({
  basePath,
  headers,
  rows,
  noun,
  createLabel,
  canWrite = false,
}: {
  /** `/sites/<site>/autores`: a criação é `<basePath>/novo` e a edição `<basePath>/<id>`. */
  basePath: string;
  /** Rótulo do nome e das demais células, na ordem. */
  headers: [string, ...string[]];
  rows: EntityRow[];
  noun: { one: string; many: string; none: string };
  createLabel: string;
  canWrite?: boolean;
}) {
  const [nameHeader, ...rest] = headers;
  const columns = column.columns([
    column.accessor('name', { header: nameHeader }),
    ...rest.map((header, index) =>
      column.accessor((row) => row.cells[index] ?? '', { id: `cell-${index}`, header }),
    ),
  ]);
  const table = useTable({ features, columns, data: rows });
  const colSpan = columns.length + (canWrite ? 1 : 0);
  return (
    <div className="space-y-4">
      {canWrite && (
        <Link href={`${basePath}/novo`} className={buttonVariants({ size: 'sm' })}>
          {createLabel}
        </Link>
      )}
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
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                {noun.none}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
