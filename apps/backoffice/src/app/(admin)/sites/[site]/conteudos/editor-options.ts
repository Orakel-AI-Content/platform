import type { ContentEditorOptions } from '@/components/contents/ContentEditor';
import type { MediaSource } from '@/components/forms/PickerFields';
import type { Executor } from '@/db/client.ts';
import type { Actor } from '@/domain/access/rbac.ts';
import { listAuthors } from '@/domain/content/authors.ts';
import { listTaxonomies } from '@/domain/content/taxonomies.ts';
import { resourcesFor } from '@/domain/sites/sites.ts';

import { listMediaPageAction, mediaByIdsAction } from '../midia/actions.ts';

const TAXONOMY_KIND_LABEL = { category: 'categoria', tag: 'tag', series: 'série' } as const;

/**
 * Biblioteca do site para os campos de mídia (#182): a grade lê por página e a miniatura do
 * valor atual por ID, pelas Server Actions ligadas ao site; nada é carregado de antemão.
 */
export function mediaSource(siteId: string): MediaSource {
  return {
    load: listMediaPageAction.bind(null, siteId),
    byIds: mediaByIdsAction.bind(null, siteId),
  };
}

/** Opções do editor: tipos da release e as referências que existem no site. */
export async function editorOptions(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<ContentEditorOptions | undefined> {
  const [authors, taxonomies, resources] = await Promise.all([
    listAuthors(db, actor, siteId),
    listTaxonomies(db, actor, siteId),
    resourcesFor(db, siteId),
  ]);
  if (!authors.ok || !taxonomies.ok) return undefined;
  return {
    blockTypes: resources.blockTypes,
    media: mediaSource(siteId),
    authors: authors.value.map((author) => ({ id: author.id, label: author.name })),
    taxonomies: taxonomies.value.map((taxonomy) => ({
      id: taxonomy.id,
      label: `${taxonomy.name} (${TAXONOMY_KIND_LABEL[taxonomy.kind]})`,
    })),
  };
}
