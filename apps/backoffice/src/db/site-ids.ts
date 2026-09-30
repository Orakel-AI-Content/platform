import { sql } from 'drizzle-orm';

import type { Executor } from './client.ts';
import { siteSequences } from './schema/index.ts';

/**
 * Próximo ID da entidade no site, ou reserva um ID explícito (importação), mantendo a
 * sequência sempre acima do maior ID usado: nenhum ID é reutilizado.
 */
export async function allocateId(
  tx: Executor,
  siteId: string,
  entity: string,
  explicit?: number,
): Promise<number> {
  const target = [siteSequences.siteId, siteSequences.entity];
  if (explicit !== undefined) {
    await tx
      .insert(siteSequences)
      .values({ siteId, entity, last: explicit })
      .onConflictDoUpdate({
        target,
        set: { last: sql`greatest(${siteSequences.last}, ${explicit})` },
      });
    return explicit;
  }
  const [row] = await tx
    .insert(siteSequences)
    .values({ siteId, entity, last: 1 })
    .onConflictDoUpdate({ target, set: { last: sql`${siteSequences.last} + 1` } })
    .returning({ last: siteSequences.last });
  if (row === undefined)
    throw new Error(`Sequência de ${entity} do site ${siteId} não retornou valor`);
  return row.last;
}
