// Colunas operacionais do site (estado, motivo da pausa, ciclo de vida), gravadas pelo build.
// Não vão para o snapshot: gravar aqui não gera mudança pendente — senão cada build
// agendaria outro. Único módulo fora de pending-changes liberado no teste de varredura.
import { and, eq, ne } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { sites } from '../../db/schema/index.ts';

/** Falha permanente: o site para de receber builds até ser retomado (L4). */
export async function pauseSite(tx: Executor, siteId: string, reason: string): Promise<void> {
  await tx
    .update(sites)
    .set({ state: 'pausado', pausedReason: reason })
    .where(eq(sites.id, siteId));
}

/** Primeira publicação bem-sucedida: o site passa a `publicado`. */
export async function markPublished(tx: Executor, siteId: string): Promise<void> {
  await tx
    .update(sites)
    .set({ lifecycle: 'publicado' })
    .where(and(eq(sites.id, siteId), ne(sites.lifecycle, 'publicado')));
}
