import { cache } from 'react';

import { currentActor } from '@/auth/request-actor.ts';
import { getDb } from '@/db/client.ts';
import { listContentVersions } from '@/domain/content/contents.ts';

/**
 * Versões de um conteúdo e quem pede, lidas uma vez por requisição: o título da aba
 * (`generateMetadata`) e a página compartilham o resultado (#79, `cache` do React, como o
 * `lookupSite`). `undefined` sem sessão.
 */
export const readContentVersions = cache(async (siteId: string, contentId: number) => {
  const actor = await currentActor();
  if (!actor.ok) return undefined;
  const versions = await listContentVersions(getDb().db, actor.value, siteId, contentId);
  return { actor: actor.value, versions };
});
