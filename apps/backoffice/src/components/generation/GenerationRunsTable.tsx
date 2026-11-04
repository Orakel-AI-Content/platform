'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import DataTable, { type ColumnDef } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ROW_LINK_CLASS } from '@/components/shared/rowLink';
import { formatDateTime, type StateTagColor } from '@/components/shared/siteLabels.ts';
import { Truncated } from '@/components/shared/Truncated';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState.ts';
import { StateTag } from '@/components/sites/SiteStatus';
import type { GenerationStatus } from '@/db/schema/generation.ts';
import type { GenerationRunSummary } from '@/domain/generation/runs.ts';

/** Sem busca, filtro nem ordem (fora do escopo, #541): a do domínio, a mais recente primeiro. */
const LIST: ListConfig = { filters: [], sortable: [], pageSizes: [10, 25, 50, 100] };

export const GENERATION_STATUS_LABEL: Record<GenerationStatus, string> = {
  pendente: 'Pendente',
  ok: 'Concluída',
  falha: 'Falhou',
};

const GENERATION_STATUS_TAG: Record<GenerationStatus, StateTagColor> = {
  pendente: 'bg-warning',
  ok: 'bg-success',
  falha: 'bg-error',
};

/** Valor que a execução não tem (pendente, falha antes do modelo, modelo sem preço). */
export const MISSING = '—';

const integer = new Intl.NumberFormat('pt-BR');
const usd = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});
const seconds = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function formatTokens(value: number | null): string {
  return value === null ? MISSING : integer.format(value);
}

export function formatCost(value: number | null): string {
  return value === null ? MISSING : usd.format(value);
}

/** Duração da chamada: "850 ms" abaixo de 1 s; senão "12,3 s". */
export function formatRunDuration(ms: number | null): string {
  if (ms === null) return MISSING;
  return ms < 1000 ? `${ms} ms` : `${seconds.format(ms / 1000)} s`;
}

function columnsFor(siteId: string, timeZone: string): ColumnDef<GenerationRunSummary>[] {
  return [
    {
      header: 'Disparada em',
      accessorKey: 'createdAt',
      enableSorting: false,
      cell: ({ row }) => formatDateTime(row.original.createdAt, timeZone),
    },
    {
      header: 'Tema',
      accessorKey: 'topic',
      enableSorting: false,
      cell: ({ row }) => <Truncated text={row.original.topic} className="max-w-56" />,
    },
    {
      header: 'Status',
      accessorKey: 'status',
      enableSorting: false,
      cell: ({ row }) => (
        <StateTag color={GENERATION_STATUS_TAG[row.original.status]}>
          {GENERATION_STATUS_LABEL[row.original.status]}
        </StateTag>
      ),
    },
    {
      header: 'Provedor',
      accessorKey: 'provider',
      enableSorting: false,
      cell: ({ row }) => row.original.provider ?? MISSING,
    },
    {
      header: 'Modelo',
      accessorKey: 'model',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.model === null ? (
          MISSING
        ) : (
          <Truncated text={row.original.model} className="max-w-40" />
        ),
    },
    {
      header: 'Tokens de entrada',
      accessorKey: 'inputTokens',
      enableSorting: false,
      cell: ({ row }) => formatTokens(row.original.inputTokens),
    },
    {
      header: 'Tokens de saída',
      accessorKey: 'outputTokens',
      enableSorting: false,
      cell: ({ row }) => formatTokens(row.original.outputTokens),
    },
    {
      header: 'Custo (US$)',
      accessorKey: 'costUsd',
      enableSorting: false,
      cell: ({ row }) => formatCost(row.original.costUsd),
    },
    {
      header: 'Duração',
      accessorKey: 'durationMs',
      enableSorting: false,
      cell: ({ row }) => formatRunDuration(row.original.durationMs),
    },
    {
      header: 'Conteúdo',
      accessorKey: 'contentId',
      enableSorting: false,
      cell: ({ row }) => {
        const { contentId, status } = row.original;
        if (status !== 'ok' || contentId === null) return MISSING;
        return (
          <Link
            href={`/sites/${encodeURIComponent(siteId)}/conteudos/${contentId}`}
            className={ROW_LINK_CLASS}
          >
            Conteúdo {contentId}
            <span className="sr-only"> (abrir)</span>
          </Link>
        );
      },
    },
  ];
}

/**
 * Execuções da geração do site (R5), só leitura: quando, tema, status, provedor, modelo, tokens,
 * custo, duração e o link para o conteúdo gerado. No DataTable do template, como a lista de
 * pendências (#365), sem toolbar (busca e filtro ficam fora, #541); o que a execução ainda não
 * tem aparece como "—". Sem execuções, o estado vazio.
 */
export function GenerationRunsTable({
  siteId,
  timeZone,
  rows,
  labelledBy,
}: {
  siteId: string;
  /** Fuso do site (`SiteSummary.timeZone`): as datas aparecem nele. */
  timeZone: string;
  rows: GenerationRunSummary[];
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
}) {
  const columns = useMemo(() => columnsFor(siteId, timeZone), [siteId, timeZone]);
  const { tableProps } = useListTable({ config: LIST, columns, data: rows });
  if (rows.length === 0) {
    return <EmptyState>Nenhuma execução ainda: gere o primeiro artigo.</EmptyState>;
  }
  return (
    <DataTable
      compact
      aria-labelledby={labelledBy}
      instanceId="generation-runs-table"
      columns={columns}
      {...tableProps}
    />
  );
}
