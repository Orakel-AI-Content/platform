import { cache } from 'react';

import { currentActor } from '@/auth/request-actor.ts';
import { getDb } from '@/db/client.ts';
import { listContentVersions } from '@/domain/content/contents.ts';
import { DEFAULT_TIME_ZONE } from '@/domain/sites/sites.ts';

import { lookupSite } from '../editorial-page.tsx';

/**
 * Versões de um conteúdo e quem pede, lidas uma vez por requisição: o título da aba
 * (`generateMetadata`) e a página compartilham o resultado (#79, `cache` do React, como o
 * `lookupSite`), com o fuso do site para as datas (#90). `undefined` sem sessão.
 */
export const readContentVersions = cache(async (siteId: string, contentId: number) => {
  const actor = await currentActor();
  if (!actor.ok) return undefined;
  const versions = await listContentVersions(getDb().db, actor.value, siteId, contentId);
  // A mesma busca do layout (`cache`); sem site, o layout já respondeu e o fuso não aparece.
  const lookup = await lookupSite(siteId);
  const timeZone = lookup.kind === 'found' ? lookup.site.timeZone : DEFAULT_TIME_ZONE;
  return { actor: actor.value, versions, timeZone };
});
