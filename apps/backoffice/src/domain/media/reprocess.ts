import { RESOURCES, type Media, type Resources } from '@orakel/content-model/v1';
import { asc, eq, sql } from 'drizzle-orm';

import type { Db, Executor } from '../../db/client.ts';
import { media, mediaVariants } from '../../db/schema/index.ts';
import { SYSTEM_ACTOR } from '../access/rbac.ts';
import { addMediaVariants } from '../content/media.ts';
import type { ObjectStore } from './store.ts';
import { generateVariants, profileVariants, type VariantSpec } from './variants.ts';

// Reprocessamento (12.0, L4; promoção de release, L6 passo 1): compara as variantes
// registradas de cada mídia com o perfil de imagem e gera, a partir do original, só as que
// faltam. Rodar de novo sem mudança no perfil não lê nem grava nada.

export const REPROCESS_TASK = 'media-reprocess';

/** Variantes que o perfil exige da mídia e que ela ainda não tem registradas. */
export function missingVariants(
  item: Pick<Media, 'width' | 'variants'>,
  resources: Resources = RESOURCES,
): VariantSpec[] {
  const registered = new Set(item.variants.map((v) => `${v.width}/${v.format}`));
  return profileVariants(item.width, resources).filter(
    (spec) => !registered.has(`${spec.width}/${spec.format}`),
  );
}

export type ReprocessReport = {
  /** Mídias que ganharam variantes. */
  updated: number[];
  /** Mídias com variante faltando e sem original guardado. */
  withoutOriginal: number[];
  /** Arquivos gravados no bucket do site. */
  written: number;
};

export type ReprocessDeps = {
  db: Db;
  store: ObjectStore;
  warn?: (message: string) => void;
};

export async function reprocessSiteMedia(
  deps: ReprocessDeps,
  siteId: string,
  resources: Resources = RESOURCES,
): Promise<ReprocessReport> {
  const report: ReprocessReport = { updated: [], withoutOriginal: [], written: 0 };
  for (const item of await mediaWithOriginals(deps.db, siteId)) {
    const missing = missingVariants(item, resources);
    if (missing.length === 0) continue;
    const generated =
      item.originalKey === null
        ? ({ status: 'missing' } as const)
        : await generateVariants(
            deps.store,
            { siteId, originalKey: item.originalKey, width: item.width, height: item.height },
            missing,
          );
    if (generated.status === 'missing') {
      report.withoutOriginal.push(item.id);
      deps.warn?.(
        `mídia ${item.id} de ${siteId} sem original guardado: faltam ${missing.length} variantes`,
      );
      continue;
    }
    const added = await deps.db.transaction((tx) =>
      addMediaVariants(tx, SYSTEM_ACTOR, siteId, item.id, generated.media.variants),
    );
    if (!added.ok) throw new Error(`Variantes da mídia ${item.id} recusadas`);
    report.written += generated.written;
    if (added.value.added > 0) report.updated.push(item.id);
  }
  return report;
}

type MediaRow = Pick<Media, 'id' | 'width' | 'height' | 'variants'> & {
  originalKey: string | null;
};

async function mediaWithOriginals(db: Executor, siteId: string): Promise<MediaRow[]> {
  const rows = await db
    .select({
      id: media.id,
      width: media.width,
      height: media.height,
      originalKey: media.originalKey,
    })
    .from(media)
    .where(eq(media.siteId, siteId))
    .orderBy(asc(media.id));
  const variants = await db
    .select({
      mediaId: mediaVariants.mediaId,
      width: mediaVariants.width,
      format: mediaVariants.format,
      path: mediaVariants.path,
    })
    .from(mediaVariants)
    .where(eq(mediaVariants.siteId, siteId));
  return rows.map((row) => ({
    ...row,
    variants: variants
      .filter((variant) => variant.mediaId === row.id)
      .map(({ width, format, path }) => ({ width, format, path })),
  }));
}

/**
 * Enfileira o reprocessamento de um site; com o mesmo `job_key`, pedir de novo enquanto o
 * job espera na fila não cria outro.
 */
export async function enqueueReprocess(db: Executor, siteId: string): Promise<void> {
  await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${REPROCESS_TASK},
      payload => ${JSON.stringify({ siteId })}::json,
      max_attempts => 5,
      job_key => ${`${REPROCESS_TASK}:${siteId}`},
      job_key_mode => 'preserve_run_at'
    )`);
}
