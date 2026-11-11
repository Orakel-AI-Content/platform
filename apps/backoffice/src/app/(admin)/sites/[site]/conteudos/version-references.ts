import type { MediaItem } from '@/components/media/MediaLibrary';
import type { VersionReferences } from '@/components/contents/ContentVersionView';
import type { Executor } from '@/db/client.ts';
import type { ContentData } from '@/db/schema/index.ts';
import type { Actor } from '@/domain/access/rbac.ts';
import { MAX_MEDIA_PAGE_SIZE } from '@/domain/content/media.ts';

import { mediaByIdsAction } from '../midia/actions.ts';
import { contentReferences, type ContentReferences } from './editor-options.ts';

/** IDs únicos das mídias de uma versão: a capa e as imagens dos blocos, na ordem em que aparecem. */
export function versionMediaIds(data: ContentData): number[] {
  const ids = [
    ...(data.coverMediaId === undefined ? [] : [data.coverMediaId]),
    ...data.blocks.flatMap((block) => (block.type === 'image' ? [block.mediaId] : [])),
  ];
  return [...new Set(ids)];
}

/** Os rótulos de `contentReferences` por ID, como a leitura de uma versão e o resumo os leem. */
export function referenceLabels(
  references: ContentReferences,
): Pick<VersionReferences, 'authors' | 'taxonomies'> {
  return {
    authors: new Map(references.authors.map((author) => [author.id, author.label])),
    taxonomies: new Map(references.taxonomies.map((taxonomy) => [taxonomy.id, taxonomy.label])),
  };
}

/**
 * Nomes e miniaturas da leitura de uma versão (#593), com as mesmas leituras do editor: os
 * rótulos de `contentReferences` e as mídias por ID (`mediaByIdsAction`, em lotes do limite da
 * leitura). ID que não volta é referência removida; `undefined` se alguma leitura foi recusada.
 */
export async function readVersionReferences(
  db: Executor,
  actor: Actor,
  siteId: string,
  data: ContentData,
): Promise<VersionReferences | undefined> {
  const ids = versionMediaIds(data);
  const batches: number[][] = [];
  for (let start = 0; start < ids.length; start += MAX_MEDIA_PAGE_SIZE) {
    batches.push(ids.slice(start, start + MAX_MEDIA_PAGE_SIZE));
  }
  const [references, ...found] = await Promise.all([
    contentReferences(db, actor, siteId),
    ...batches.map((batch) => mediaByIdsAction(siteId, batch)),
  ]);
  if (references === undefined || found.some((items) => items === null)) return undefined;
  return {
    ...referenceLabels(references),
    media: new Map(
      found.flatMap((items) => items ?? []).map((item): [number, MediaItem] => [item.id, item]),
    ),
  };
}
