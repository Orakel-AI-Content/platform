import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Releases do core registradas pela operação (L1): a tag (core-vX.Y.Z) é também a tag da
 * imagem site-builder e o valor de `sites.release` e `builds.release`. Operacional: fora do
 * snapshot, sem mudança pendente.
 */
export const releases = pgTable('releases', {
  tag: text().primaryKey(),
  registeredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
