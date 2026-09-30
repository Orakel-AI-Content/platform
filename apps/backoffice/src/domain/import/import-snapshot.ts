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
import { createSite } from '../sites/sites.ts';

/** Interrompe a transação com os problemas de uma etapa (vira `Result` fora dela). */
class ImportAborted extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super('Importação interrompida');
    this.issues = issues;
  }
}

/**
 * Importa um snapshot inteiro (fixtures dos sites de exemplo) pelos módulos de domínio,
 * preservando os IDs, numa única transação. Os conteúdos entram publicados.
 */
export async function importSnapshot(
  db: Db,
  actor: Actor,
  lines: readonly SnapshotLine[],
): Promise<Result<{ siteId: string }>> {
  const validated = validateSnapshot(lines);
  if (!validated.ok) return validated;
  const snapshot = validated.value;
  const siteId = snapshot.config.siteId;

  try {
    await db.transaction(async (tx) => {
      const steps: (() => Promise<Result<unknown>>)[] = [
        () => createSite(tx, actor, snapshot.config),
        ...snapshot.media.map(
          ({ id, ...data }) =>
            () =>
              createMedia(tx, actor, siteId, data, { id }),
        ),
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
