import {
  constructTable,
  createColumnHelper,
  flexRender,
  tableFeatures,
} from '@tanstack/react-table';
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings';
import Link from 'next/link';

import {
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_TAG,
  formatDateTime,
} from '@/components/shared/siteLabels.ts';
import { StateTag } from '@/components/sites/SiteStatus';
import Table from '@/components/ui/Table';
import type { ContentListItem } from '@/domain/content/contents.ts';

/** Linha da tela de versões: só o que a tabela mostra (sem os dados da versão). */
export type ContentVersionRow = {
  version: number;
  status: ContentListItem['status'];
  title: string;
  createdAt: Date;
  /** Quem aprovou a versão e quando (`reviews`); nula sem aprovação. */
  approval: { reviewer: string; approvedAt: Date } | null;
};

// TanStack Table 9 sem hook (Server Component): só o modelo de linhas básico, com a
// reatividade do TanStack Store que o `constructTable` exige no lugar da do `useTable`.
const features = tableFeatures({ coreReactivityFeature: storeReactivityBindings() });
const column = createColumnHelper<typeof features, ContentVersionRow>();
const { THead, TBody, Tr, Th, Td } = Table;

function columnsFor(siteId: string, contentId: number, timeZone: string) {
  return column.columns([
    column.accessor('version', {
      header: 'Versão',
      cell: (info) => (
        <Link
          href={`/sites/${siteId}/conteudos/${contentId}/versoes/${info.getValue()}`}
          className="font-semibold text-gray-900 underline underline-offset-4 hover:text-primary dark:text-gray-100"
        >
          Versão {info.getValue()}
        </Link>
      ),
    }),
    column.accessor('status', {
      header: 'Status',
      cell: (info) => (
        <StateTag color={CONTENT_STATUS_TAG[info.getValue()]}>
          {CONTENT_STATUS_LABEL[info.getValue()]}
        </StateTag>
      ),
    }),
    column.accessor('title', { header: 'Título' }),
    column.accessor('createdAt', {
      header: 'Gravada em',
      cell: (info) => formatDateTime(info.getValue(), timeZone),
    }),
    // Duas linhas, como na tabela densa: o revisor e, embaixo, a data; vazia sem aprovação.
    column.accessor('approval', {
      header: 'Aprovação',
      cell: (info) => {
        const approval = info.getValue();
        if (approval === null) return null;
        return (
          <span className="flex flex-col items-start gap-0.5">
            <span>{approval.reviewer}</span>
            <span className="text-xs">{formatDateTime(approval.approvedAt, timeZone)}</span>
          </span>
        );
      },
    }),
  ]);
}

/** Versões de um conteúdo, da primeira à mais recente, cada uma com link para lê-la. */
export function ContentVersionsTable({
  siteId,
  contentId,
  timeZone,
  rows,
}: {
  siteId: string;
  contentId: number;
  /** Fuso do site (`SiteSummary.timeZone`): as datas aparecem nele. */
  timeZone: string;
  rows: ContentVersionRow[];
}) {
  const table = constructTable({
    features,
    columns: columnsFor(siteId, contentId, timeZone),
    data: rows,
  });
  return (
    <Table compact>
      <caption className="mt-4 caption-bottom text-sm">
        {rows.length === 1 ? '1 versão' : `${rows.length} versões`}
      </caption>
      <THead>
        {table.getHeaderGroups().map((group) => (
          <Tr key={group.id}>
            {group.headers.map((header) => (
              <Th key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </Th>
            ))}
          </Tr>
        ))}
      </THead>
      <TBody>
        {table.getRowModel().rows.map((row) => (
          <Tr key={row.id}>
            {row.getAllCells().map((cell) => (
              <Td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Td>
            ))}
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
