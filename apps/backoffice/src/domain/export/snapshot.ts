import type { Result } from '@orakel/content-model';
import { SCHEMA_VERSION, type EndLine, type SnapshotLine } from '@orakel/content-model/v1';
import { and, asc, desc, eq } from 'drizzle-orm';

import type { Db, Executor } from '../../db/client.ts';
import {
  authors,
  contentVersions,
  media,
  mediaVariants,
  menus,
  redirects,
  taxonomies,
} from '../../db/schema/index.ts';
import { currentConfig, siteExists, unresolvedPendingChangeIds } from '../sites/sites.ts';
import { toAuthor, toContent, toMedia, toRedirect, toTaxonomy } from './mappers.ts';

/**
 * Linhas do snapshot de um site, na ordem do contrato: header (mudanças pendentes visíveis),
 * config, autores, taxonomias, menus, mídias, redirects, conteúdos publicados, end. Precisa
 * rodar dentro de uma transação REPEATABLE READ: a primeira leitura fixa o snapshot, e toda
 * mudança confirmada depois fica de fora (e continua pendente).
 */
export async function* snapshotLines(tx: Executor, siteId: string): AsyncGenerator<SnapshotLine> {
  const pendingChangeIds = await unresolvedPendingChangeIds(tx, siteId);
  yield { type: 'header', schemaVersion: SCHEMA_VERSION, site: siteId, pendingChangeIds };

  const counts: EndLine['counts'] = {
    config: 0,
    author: 0,
    taxonomy: 0,
    menu: 0,
    media: 0,
    redirect: 0,
    content: 0,
  };

  const config = await currentConfig(tx, siteId);
  if (config !== undefined) {
    counts.config += 1;
    yield { type: 'config', data: config };
  }

  for (const row of await tx
    .select()
    .from(authors)
    .where(eq(authors.siteId, siteId))
    .orderBy(asc(authors.id))) {
    counts.author += 1;
    yield { type: 'author', data: toAuthor(row) };
  }

  for (const row of await tx
    .select()
    .from(taxonomies)
    .where(eq(taxonomies.siteId, siteId))
    .orderBy(asc(taxonomies.id))) {
    counts.taxonomy += 1;
    yield { type: 'taxonomy', data: toTaxonomy(row) };
  }

  for (const row of await tx
    .select()
    .from(menus)
    .where(eq(menus.siteId, siteId))
    .orderBy(asc(menus.id))) {
    counts.menu += 1;
    yield { type: 'menu', data: { id: row.id, key: row.key, items: row.items } };
  }

  const variants = await tx
    .select()
    .from(mediaVariants)
    .where(eq(mediaVariants.siteId, siteId))
    .orderBy(asc(mediaVariants.mediaId), asc(mediaVariants.width), asc(mediaVariants.format));
  for (const row of await tx
    .select()
    .from(media)
    .where(eq(media.siteId, siteId))
    .orderBy(asc(media.id))) {
    counts.media += 1;
    yield {
      type: 'media',
      data: toMedia(
        row,
        variants.filter((v) => v.mediaId === row.id),
      ),
    };
  }

  for (const row of await tx
    .select()
    .from(redirects)
    .where(eq(redirects.siteId, siteId))
    .orderBy(asc(redirects.id))) {
    counts.redirect += 1;
    yield { type: 'redirect', data: toRedirect(row) };
  }

  // Última versão publicada de cada conteúdo.
  const published = await tx
    .selectDistinctOn([contentVersions.contentId], {
      contentId: contentVersions.contentId,
      data: contentVersions.data,
    })
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, siteId), eq(contentVersions.status, 'publicado')))
    .orderBy(asc(contentVersions.contentId), desc(contentVersions.version));
  for (const row of published) {
    counts.content += 1;
    yield { type: 'content', data: toContent(row) };
  }

  yield { type: 'end', counts };
}

/**
 * Snapshot em NDJSON para a API de exportação, lido numa transação REPEATABLE READ só de
 * leitura. As linhas saem conforme são lidas, entidade por entidade.
 */
export async function openSnapshot(
  db: Db,
  siteId: string,
): Promise<Result<ReadableStream<Uint8Array>>> {
  if (!(await siteExists(db, siteId))) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await db.transaction(
          async (tx) => {
            for await (const line of snapshotLines(tx, siteId)) {
              controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
            }
          },
          { isolationLevel: 'repeatable read', accessMode: 'read only' },
        );
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return { ok: true, value: stream };
}
