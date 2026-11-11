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

/** Autores e taxonomias do site como opções (rótulo da taxonomia com o tipo). */
export type ContentReferences = Pick<ContentEditorOptions, 'authors' | 'taxonomies'>;

/**
 * Autores e taxonomias do site, já com o rótulo de cada um: as opções do editor e os nomes na
 * leitura de uma versão (#593). `undefined` se alguma leitura foi recusada.
 */
export async function contentReferences(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<ContentReferences | undefined> {
  const [authors, taxonomies] = await Promise.all([
    listAuthors(db, actor, siteId),
    listTaxonomies(db, actor, siteId),
  ]);
  if (!authors.ok || !taxonomies.ok) return undefined;
  return {
    authors: authors.value.map((author) => ({ id: author.id, label: author.name })),
    taxonomies: taxonomies.value.map((taxonomy) => ({
      id: taxonomy.id,
      label: `${taxonomy.name} (${TAXONOMY_KIND_LABEL[taxonomy.kind]})`,
    })),
  };
}

/** Opções do editor: tipos da release e as referências que existem no site. */
export async function editorOptions(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<ContentEditorOptions | undefined> {
  const [references, resources] = await Promise.all([
    contentReferences(db, actor, siteId),
    resourcesFor(db, siteId),
  ]);
  if (references === undefined) return undefined;
  return { blockTypes: resources.blockTypes, media: mediaSource(siteId), ...references };
}
