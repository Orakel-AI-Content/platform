import { RESOURCES } from '@orakel/content-model/v1';

import type { ContentEditorOptions } from '@/components/content-editor';
import type { Executor } from '@/db/client.ts';
import type { Actor } from '@/domain/access/rbac.ts';
import { listAuthors } from '@/domain/content/authors.ts';
import { listMedia } from '@/domain/content/media.ts';
import { listTaxonomies } from '@/domain/content/taxonomies.ts';

const TAXONOMY_KIND_LABEL = { category: 'categoria', tag: 'tag', series: 'série' } as const;

/** Opções do editor: tipos da release e as referências que existem no site. */
export async function editorOptions(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<ContentEditorOptions | undefined> {
  const [media, authors, taxonomies] = await Promise.all([
    listMedia(db, actor, siteId),
    listAuthors(db, actor, siteId),
    listTaxonomies(db, actor, siteId),
  ]);
  if (!media.ok || !authors.ok || !taxonomies.ok) return undefined;
  return {
    blockTypes: RESOURCES.blockTypes,
    media: media.value.map((item) => ({
      id: item.id,
      label: `Mídia ${item.id} (${item.width}×${item.height})`,
    })),
    authors: authors.value.map((author) => ({ id: author.id, label: author.name })),
    taxonomies: taxonomies.value.map((taxonomy) => ({
      id: taxonomy.id,
      label: `${taxonomy.name} (${TAXONOMY_KIND_LABEL[taxonomy.kind]})`,
    })),
  };
}
