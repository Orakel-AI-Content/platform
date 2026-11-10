import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Releases do core registradas pela operação (L1): a tag (X.Y.Z) é a tag da imagem
 * site-builder, publicada pela tag Git core-vX.Y.Z, e o valor de `sites.release` e
 * `builds.release`. Operacional: fora do
 * snapshot, sem mudança pendente.
 */
export const releases = pgTable('releases', {
  tag: text().primaryKey(),
  registeredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
