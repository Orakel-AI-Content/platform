import type { Issue, Result } from '@orakel/content-model';
import { validateSnapshot, type SnapshotLine } from '@orakel/content-model/v1';

import type { Db } from '../../db/client.ts';
import type { Actor } from '../access/rbac.ts';
import { createAuthor } from '../content/authors.ts';
import { createContent } from '../content/contents.ts';
import { createMedia } from '../content/media.ts';
import { createMenu } from '../content/menus.ts';
import { createRedirect } from '../content/redirects.ts';
import { createTaxonomy } from '../content/taxonomies.ts';
import { recordImportedUpload } from '../media/upload.ts';
import { createSite } from '../sites/sites.ts';

/** Interrompe a transação com os problemas de uma etapa (vira `Result` fora dela). */
class ImportAborted extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super('Importação interrompida');
    this.issues = issues;
  }
}

/** De onde veio uma mídia importada: o original guardado e o envio para a biblioteca. */
export type MediaOrigin = { originalKey: string; originalName: string; uploadedAt: Date };

/**
 * Importa um snapshot inteiro (fixtures e seeds dos sites locais) pelos módulos de domínio,
 * preservando os IDs, numa única transação. Os conteúdos entram publicados. Com
 * `mediaOrigins`, a mídia guarda o original (reprocessamento) e o envio fica registrado.
 */
export async function importSnapshot(
  db: Db,
  actor: Actor,
  lines: readonly SnapshotLine[],
  options: { mediaOrigins?: ReadonlyMap<number, MediaOrigin> } = {},
): Promise<Result<{ siteId: string }>> {
  const validated = validateSnapshot(lines);
  if (!validated.ok) return validated;
  const snapshot = validated.value;
  const siteId = snapshot.config.siteId;

  try {
    await db.transaction(async (tx) => {
      const steps: (() => Promise<Result<unknown>>)[] = [
        () => createSite(tx, actor, snapshot.config),
        ...snapshot.media.map(({ id, ...data }) => async () => {
          const origin = options.mediaOrigins?.get(id);
          const created = await createMedia(tx, actor, siteId, data, {
            id,
            originalKey: origin?.originalKey,
          });
          if (created.ok && origin !== undefined) {
            const { originalName, uploadedAt } = origin;
            await recordImportedUpload(tx, { siteId, mediaId: id, originalName, uploadedAt });
          }
          return created;
        }),
        ...snapshot.authors.map(
          ({ id, ...data }) =>
            () =>
              createAuthor(tx, actor, siteId, data, { id }),
        ),
        ...snapshot.taxonomies.map(
          ({ id, ...data }) =>
            () =>
              createTaxonomy(tx, actor, siteId, data, { id }),
        ),
        ...snapshot.menus.map(
          ({ id, ...data }) =>
            () =>
              createMenu(tx, actor, siteId, data, { id }),
        ),
        ...snapshot.redirects.map(
          ({ id, ...data }) =>
            () =>
              createRedirect(tx, actor, siteId, data, { id }),
        ),
        ...snapshot.contents.map(
          ({ id, ...data }) =>
            () =>
              createContent(tx, actor, siteId, data, { id, status: 'publicado' }),
        ),
      ];
      for (const step of steps) {
        const result = await step();
        if (!result.ok) throw new ImportAborted(result.issues);
      }
    });
  } catch (error) {
    if (error instanceof ImportAborted) return { ok: false, issues: error.issues };
    throw error;
  }
  return { ok: true, value: { siteId } };
}
