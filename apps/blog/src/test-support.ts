// Fixtures do content-model para os testes unitários, lidas pelo mesmo caminho do modo
// fixture (fixtureFetch + readSnapshot). Não entra no build.
import { readSnapshot } from '@orakel/content-client/v1';

import { FIXTURE_BASE_URL, FIXTURE_TOKEN, fixtureFetch } from './data/fixture-fetch.ts';
import type { SiteData } from './data/site-source.ts';

export async function fixtureSite(site: 'exemplo-a' | 'exemplo-b'): Promise<SiteData> {
  const result = await readSnapshot({
    baseUrl: FIXTURE_BASE_URL,
    site,
    token: FIXTURE_TOKEN,
    fetch: fixtureFetch,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}
