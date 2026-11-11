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
/** Em dólares, com a moeda no cabeçalho da coluna. */
const usd = new Intl.NumberFormat('pt-BR', {
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
      cell: ({ row }) => <Truncated text={row.original.topic} className="max-w-32" />,
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
      // Provedor e modelo na mesma célula (duas linhas): a lista cabe na largura sem rolagem.
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
      // Entrada e saída na mesma célula, rotuladas (duas linhas), pelo mesmo motivo.
      header: 'Tokens (entrada / saída)',
      id: 'tokens',
      enableSorting: false,
      cell: ({ row }) => {
        const { inputTokens, outputTokens } = row.original;
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
            <span className="sr-only">Conteúdo </span>#{contentId}
            <span className="sr-only"> (abrir)</span>
          </Link>
        );
      },
    },
  ];
}

/**
 * Execuções da geração do site (R5), só leitura: quando, tema, status, provedor e modelo, tokens,
 * custo, duração e o link para o conteúdo gerado. No DataTable do template, como a lista de
 * pendências (#365), sem toolbar (busca e filtro ficam fora, #541); o que a execução ainda não
 * tem aparece como "—". Sem execuções, o estado vazio; sem contexto editorial no site (#600), ele
 * não manda gerar: a ação de criar o contexto fica no aviso acima.
 */
export function GenerationRunsTable({
  siteId,
  timeZone,
  rows,
  hasContext,
  labelledBy,
}: {
  siteId: string;
  /** Fuso do site (`SiteSummary.timeZone`): as datas aparecem nele. */
  timeZone: string;
  rows: GenerationRunSummary[];
  /** O site tem contexto editorial vigente: sem ele, ainda não dá para gerar. */
  hasContext: boolean;
  /** Id do título da lista, que dá nome à tabela. */
  labelledBy?: string;
}) {
  const columns = useMemo(() => columnsFor(siteId, timeZone), [siteId, timeZone]);
  const { tableProps } = useListTable({ config: LIST, columns, data: rows });
  if (rows.length === 0) {
    return (
      <EmptyState>
        {hasContext
          ? 'Nenhuma execução ainda: gere o primeiro artigo.'
          : 'Nenhuma execução ainda: a geração começa depois do contexto editorial do site.'}
      </EmptyState>
    );
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
