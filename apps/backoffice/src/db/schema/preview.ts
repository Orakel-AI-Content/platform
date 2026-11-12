import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Estado da prévia: `no_ar` (na versão atual), `atualizando` (trocando para a versão alvo),
 * `falhou` (a troca não deu certo; a versão atual continua no ar, com o motivo) e
 * `sem_versao` (nenhuma release com build ok).
 */
export const PREVIEW_STATUSES = ['no_ar', 'atualizando', 'falhou', 'sem_versao'] as const;

/** Chave da única linha de `preview_state`. */
export const PREVIEW_STATE_ID = 'preview';

/**
 * Estado da prévia (workspace#84): uma linha só, garantida pela chave fixa. Operacional: fora
 * do snapshot, sem mudança pendente. `currentRelease` é a release no ar; `targetRelease`, a
 * da troca em andamento ou da que falhou; `failureReason` acompanha `falhou`.
 */
export const previewState = pgTable(
  'preview_state',
  {
    id: text().primaryKey().default(PREVIEW_STATE_ID),
    currentRelease: text(),
    targetRelease: text(),
    status: text({ enum: PREVIEW_STATUSES }).notNull(),
    failureReason: text(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('preview_state_single_row', sql`${t.id} = 'preview'`)],
);
