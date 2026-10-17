import type { Result } from '@orakel/content-model';
import { cache } from 'react';

import { currentActor } from '@/auth/request-actor.ts';
import { getDb } from '@/db/client.ts';
import { listSites, type SiteSummary } from '@/domain/sites/sites.ts';

/**
 * Os sites que quem pede pode ver, lidos uma vez por requisição (#237): a barra lateral do
 * layout do admin, a lista de sites e o `lookupSite` das telas de site compartilham o
 * resultado (`cache` do React, como o `currentActor`). `undefined` sem sessão.
 */
export const readVisibleSites = cache(async (): Promise<Result<SiteSummary[]> | undefined> => {
  const actor = await currentActor();
  if (!actor.ok) return undefined;
  return listSites(getDb().db, actor.value);
});
