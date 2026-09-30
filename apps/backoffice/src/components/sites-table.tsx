'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';

import type { SiteSummary } from '../domain/sites/sites.ts';
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

// TanStack Table 9: só as features usadas (nenhuma além do modelo de linhas básico).
const features = tableFeatures({});
const column = createColumnHelper<typeof features, SiteSummary>();

const LIFECYCLE_LABEL: Record<SiteSummary['lifecycle'], string> = {
  cadastrado: 'Cadastrado',
  infra_aplicada: 'Infra aplicada',
  zona_ativa: 'Zona ativa',
  publicado: 'Publicado',
};

const columns = column.columns([
  column.accessor('id', { header: 'SITE_ID' }),
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
      if (site.state === 'pausado') {
        return (
          <Badge variant="warning" title={site.pausedReason ?? undefined}>
            Pausado{site.pausedReason ? `: ${site.pausedReason}` : ''}
          </Badge>
        );
      }
      return (
        <Badge variant="outline">{site.state === 'promovendo' ? 'Promovendo' : 'Ativo'}</Badge>
      );
    },
  }),
  column.accessor('release', { header: 'Release', cell: (info) => info.getValue() ?? '—' }),
  column.accessor('indexavel', {
    header: 'Indexável',
    cell: (info) => (info.getValue() ? 'Sim' : 'Não'),
  }),
  column.accessor('pendingChanges', { header: 'Mudanças pendentes' }),
]);

/** Registro de instâncias em tabela (TanStack Table + tabela do shadcn/ui). */
export function SitesTable({ rows }: { rows: SiteSummary[] }) {
  const table = useTable({ features, columns, data: rows });
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
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
              Nenhum site cadastrado.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
