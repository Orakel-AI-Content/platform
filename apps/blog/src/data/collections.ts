// Fonte do build estático: as coleções que o `snapshotLoaders` do content-client preencheu
// numa única leitura do snapshot. Monta o snapshot de volta, em ordem de ID.
import type {
  Author,
  Content,
  Media,
  Menu,
  Redirect,
  SiteConfig,
  Taxonomy,
} from '@orakel/content-model/v1';
import { getCollection } from 'astro:content';

import type { SiteData } from './site-source.ts';

async function all<T extends { id: number }>(
  name: 'authors' | 'taxonomies' | 'media' | 'redirects' | 'contents',
): Promise<T[]> {
  const entries = await getCollection(name);
  return entries.map((entry) => entry.data as T).sort((a, b) => a.id - b.id);
}

let loading: Promise<SiteData> | undefined;

export function loadBuildSite(): Promise<SiteData> {
  loading ??= (async () => {
    const [config] = await getCollection('config');
    if (!config) throw new Error('Snapshot sem configuração do site');
    const siteConfig = config.data as SiteConfig;
    const menus = (await getCollection('menus'))
      .map((entry) => entry.data as Menu)
      .sort((a, b) => a.id - b.id);
    return {
      // O header fica com o render (metaFile); as páginas não o usam.
      header: { type: 'header', schemaVersion: 1, site: siteConfig.siteId, pendingChangeIds: [] },
      config: siteConfig,
      authors: await all<Author>('authors'),
      taxonomies: await all<Taxonomy>('taxonomies'),
      menus,
      media: await all<Media>('media'),
      redirects: await all<Redirect>('redirects'),
      contents: await all<Content>('contents'),
    };
  })();
  return loading;
}
