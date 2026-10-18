'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { CONTENT_KIND_LABEL, formatDateTime } from '@/components/site-labels.ts';
import Table from '@/components/ui/Table';
import type { ReviewQueueItem } from '@/domain/content/contents.ts';

// TanStack Table 9: só as features usadas (nenhuma além do modelo de linhas básico).
const features = tableFeatures({});
const column = createColumnHelper<typeof features, ReviewQueueItem>();
const { THead, TBody, Tr, Th, Td } = Table;

function columnsFor(siteId: string, timeZone: string) {
  return column.columns([
    column.accessor('title', {
      header: 'Título',
      cell: (info) => (
        <Link
          href={`/sites/${siteId}/revisao/${info.row.original.id}`}
          className="font-semibold text-gray-900 underline underline-offset-4 hover:text-primary dark:text-gray-100"
        >
          {info.getValue()}
          <span className="sr-only"> (revisar)</span>
        </Link>
      ),
    }),
    column.accessor('kind', {
      header: 'Tipo',
      cell: (info) => CONTENT_KIND_LABEL[info.getValue()],
    }),
    column.accessor('version', { header: 'Versão' }),
    // Data da versão enviada: a data do envio não é guardada (#72).
    column.accessor('updatedAt', {
      header: 'Enviado em',
      cell: (info) => formatDateTime(info.getValue(), timeZone),
    }),
  ]);
}

/**
 * Fila de revisão do site (#74): conteúdos cuja versão mais recente está em revisão, da mais
 * antiga para a mais recente (a ordem vem do domínio). Cada título leva à tela de revisão.
 */
export function ReviewQueueTable({
  siteId,
  timeZone,
  rows,
}: {
  siteId: string;
  /** Fuso do site (`SiteSummary.timeZone`): as datas aparecem nele. */
  timeZone: string;
  rows: ReviewQueueItem[];
}) {
  const columns = columnsFor(siteId, timeZone);
  const table = useTable({ features, columns, data: rows });
  if (rows.length === 0) {
    return <EmptyState>Nenhum conteúdo aguardando revisão.</EmptyState>;
  }
  return (
    <Table compact>
      <caption className="mt-4 caption-bottom text-sm">
        {rows.length === 1
          ? '1 conteúdo aguardando revisão'
          : `${rows.length} conteúdos aguardando revisão`}
      </caption>
      <THead>
        {table.getHeaderGroups().map((group) => (
          <Tr key={group.id}>
            {group.headers.map((header) => (
              <Th key={header.id}>
                <table.FlexRender header={header} />
              </Th>
            ))}
          </Tr>
        ))}
      </THead>
      <TBody>
        {table.getRowModel().rows.map((row) => (
          <Tr key={row.id}>
            {row.getAllCells().map((cell) => (
              <Td key={cell.id}>
                <table.FlexRender cell={cell} />
              </Td>
            ))}
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
