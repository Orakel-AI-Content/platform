'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import DataTable, { type ColumnDef } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ROW_LINK_CLASS } from '@/components/shared/rowLink';
import { Truncated } from '@/components/shared/Truncated';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState.ts';
import { StateTag } from '@/components/sites/SiteStatus';
import type { GenerationStatus } from '@/db/schema/generation.ts';
import type { ReviewOpinionSummary } from '@/domain/reviews/opinions.ts';

import {
  formatCost,
  formatRunDuration,
  formatTokens,
  GENERATION_STATUS_TAG,
  MISSING,
} from './GenerationRunsTable.tsx';

/** Sem busca, filtro nem ordem (fora do escopo, #796): a do domínio, o mais recente primeiro. */
const LIST: ListConfig = { filters: [], sortable: [], pageSizes: [10, 25, 50, 100] };

/** No masculino (o parecer), com as cores das execuções. */
export const OPINION_STATUS_LABEL: Record<GenerationStatus, string> = {
  pendente: 'Pendente',
  ok: 'Concluído',
  falha: 'Falhou',
};

const reviewHref = (siteId: string, contentId: number) =>
  `/sites/${encodeURIComponent(siteId)}/revisao/${contentId}`;

/**
 * O parecer copiado na correção que não mudou o texto não chamou o modelo: tokens, custo e
 * duração ficam ausentes, senão o custo da versão de origem apareceria duas vezes.
 */
const callOf = (opinion: ReviewOpinionSummary) =>
  opinion.copiedFromVersion === null
    ? opinion
    : { inputTokens: null, outputTokens: null, costUsd: null, durationMs: null };

function columnsFor(siteId: string): ColumnDef<ReviewOpinionSummary>[] {
  return [
    {
      header: 'Conteúdo',
      id: 'content',
      enableSorting: false,
      cell: ({ row }) => (
        <Link href={reviewHref(siteId, row.original.contentId)} className={ROW_LINK_CLASS}>
          <Truncated text={row.original.contentTitle} className="max-w-40" />
        </Link>
      ),
    },
    {
      header: 'Versão',
      accessorKey: 'version',
      enableSorting: false,
      cell: ({ row }) => `v${row.original.version}`,
    },
    {
      header: 'Estado',
      accessorKey: 'status',
      enableSorting: false,
      cell: ({ row }) => {
        const { status, copiedFromVersion } = row.original;
        return (
          <div className="flex flex-col items-start gap-1">
            <StateTag color={GENERATION_STATUS_TAG[status]}>
              {OPINION_STATUS_LABEL[status]}
            </StateTag>
            {copiedFromVersion !== null && (
              <span className="text-xs whitespace-nowrap">Copiado da v{copiedFromVersion}</span>
            )}
          </div>
        );
      },
    },
    {
      // Provedor e modelo na mesma célula, como nas execuções.
      header: 'Provedor e modelo',
      id: 'model',
      enableSorting: false,
      cell: ({ row }) => {
        const { provider, model } = row.original;
        if (provider === null && model === null) return MISSING;
        return (
          <div className="flex flex-col">
            <span>{provider ?? MISSING}</span>
            <Truncated text={model ?? MISSING} className="max-w-24 text-xs" />
          </div>
        );
      },
    },
    {
      header: 'Tokens (entrada / saída)',
      id: 'tokens',
      enableSorting: false,
      cell: ({ row }) => {
        const { inputTokens, outputTokens } = callOf(row.original);
        if (inputTokens === null && outputTokens === null) return MISSING;
        return (
          <div className="flex flex-col whitespace-nowrap">
            <span>
              {formatTokens(inputTokens)}
              <span className="sr-only"> de entrada</span>
            </span>
            <span>
              {formatTokens(outputTokens)}
              <span className="sr-only"> de saída</span>
            </span>
          </div>
        );
      },
    },
    {
      header: 'Custo (US$)',
      id: 'cost',
      enableSorting: false,
      cell: ({ row }) => formatCost(callOf(row.original).costUsd),
    },
    {
      header: 'Duração',
      id: 'duration',
      enableSorting: false,
      cell: ({ row }) => formatRunDuration(callOf(row.original).durationMs),
    },
  ];
}

/**
 * Pareceres automáticos da revisão do site (workspace#94), só leitura: conteúdo com link para
 * a revisão, versão, estado, provedor e modelo, tokens, custo e duração, na ordem do domínio.
 * Sem polling: o parecer nasce no envio à revisão, não nesta tela. No DataTable do template,
 * como `GenerationRunsTable`; o que o parecer não tem aparece como "—". Sem pareceres, o
 * estado vazio.
 */
export function ReviewOpinionsTable({
  siteId,
  rows,
  labelledBy,
}: {
  siteId: string;
  rows: ReviewOpinionSummary[];
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
}) {
  const columns = useMemo(() => columnsFor(siteId), [siteId]);
  const { tableProps } = useListTable({ config: LIST, columns, data: rows });
  if (rows.length === 0) {
    return (
      <EmptyState>Nenhum parecer ainda: ele chega quando um conteúdo entra em revisão.</EmptyState>
    );
  }
  return (
    <DataTable
      compact
      aria-labelledby={labelledBy}
      instanceId="review-opinions-table"
      columns={columns}
      {...tableProps}
    />
  );
}
