// Coleções do build estático: uma leitura do snapshot do site (API ou fixture) alimenta
// todas (ADR 0002 do content-client). Na visualização não há coleções: o SSR lê por
// requisição (src/data/preview.ts).
import { SNAPSHOT_COLLECTIONS, snapshotLoaders } from '@orakel/content-client/v1/astro';
import { defineCollection } from 'astro:content';

import { FIXTURE_BASE_URL, FIXTURE_TOKEN, fixtureFetch } from './data/fixture-fetch.ts';
import { buildEnv } from './env.ts';

function staticCollections() {
  const env = buildEnv();
  const loaders = snapshotLoaders({
    site: env.SITE_ID,
    ...(env.SNAPSHOT_META_FILE && { metaFile: env.SNAPSHOT_META_FILE }),
    ...(env.CONTENT_SOURCE === 'api'
      ? { baseUrl: env.EXPORT_API_URL, token: env.EXPORT_BUILD_TOKEN }
      : { baseUrl: FIXTURE_BASE_URL, token: FIXTURE_TOKEN, fetch: fixtureFetch }),
  });
  return Object.fromEntries(
    SNAPSHOT_COLLECTIONS.map((name) => [name, defineCollection({ loader: loaders[name] })]),
  );
}

export const collections = import.meta.env.BLOG_OUTPUT === 'preview' ? {} : staticCollections();
