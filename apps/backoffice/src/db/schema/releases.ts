import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Resultado da conferência da imagem site-builder:X.Y.Z no host (valores em português). */
export const RELEASE_IMAGE_STATUSES = ['disponivel', 'ausente'] as const;

/**
 * Versões do site-builder registradas pela operação (L1): a tag (X.Y.Z) é a tag da imagem
 * site-builder, publicada pela tag Git site-builder-vX.Y.Z, e o valor de `sites.release` e
 * `builds.release`. Operacional: fora do
 * snapshot, sem mudança pendente.
 *
 * `imageStatus` e `imageCheckedAt` guardam a última conferência da imagem no host, feita pelo
 * build-runner (job `check-release-image`); as duas nulas = ainda não conferida.
 */
export const releases = pgTable('releases', {
  tag: text().primaryKey(),
  registeredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  imageStatus: text({ enum: RELEASE_IMAGE_STATUSES }),
  imageCheckedAt: timestamp({ withTimezone: true }),
});
