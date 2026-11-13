import type { InfraBatchView } from '@/components/sites/infraBatchView.ts';
import type { Executor } from '@/db/client.ts';
import type { Actor } from '@/domain/access/rbac.ts';
import { InfraPlanSummarySchema, type InfraPlanSummary } from '@/domain/infra/drivers.ts';
import { latestInfraBatch } from '@/domain/infra/runs.ts';

/** O resumo gravado, validado; nulo sem plano ou fora do formato. */
function batchSummary(raw: string | null): InfraPlanSummary | null {
  if (raw === null) return null;
  try {
    const parsed = InfraPlanSummarySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * O lote de reaplicação mais recente na forma da lista de sites (workspace#98), lido pela página
 * no servidor e pela `infraBatchAction` no polling. `null` sem lote ou sem `site.configure`.
 */
export async function readInfraBatchView(
  db: Executor,
  actor: Actor,
): Promise<InfraBatchView | null> {
  const result = await latestInfraBatch(db, actor);
  if (!result.ok || result.value === null) return null;
  const { sites, ...batch } = result.value;
  return {
    ...batch,
    sites: sites.map(({ siteId, status, currentStep, planSummary, failure }) => ({
      siteId,
      status,
      currentStep,
      summary: batchSummary(planSummary),
      failure,
    })),
  };
}
