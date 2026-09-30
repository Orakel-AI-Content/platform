// Fonte do SSR da visualização: lê o snapshot do site pedido (API ou fixture) e guarda por
// alguns segundos, para a navegação entre páginas não reler tudo. Hoje mostra o conteúdo
// publicado; rascunhos entram com a leitura ao vivo (rotas de visualização do backoffice).
import { failureKind } from '@orakel/content-client';
import { readSnapshot } from '@orakel/content-client/v1';

import type { SourceEnv } from '../env.ts';
import { BuildError } from './errors.ts';
import { FIXTURE_BASE_URL, FIXTURE_TOKEN, fixtureFetch } from './fixture-fetch.ts';
import type { SiteData } from './site-source.ts';

export const PREVIEW_CACHE_MS = 10_000;

type Entry = { at: number; data: Promise<SiteData | undefined> };
const cache = new Map<string, Entry>();

async function read(site: string, env: SourceEnv): Promise<SiteData | undefined> {
  const result = await readSnapshot(
    env.CONTENT_SOURCE === 'api'
      ? { baseUrl: env.EXPORT_API_URL, site, token: env.EXPORT_BUILD_TOKEN }
      : { baseUrl: FIXTURE_BASE_URL, site, token: FIXTURE_TOKEN, fetch: fixtureFetch },
  );
  // O `end` a mais não atrapalha: as páginas só leem o snapshot.
  if (result.ok) return result.value;
  if (result.issues.some((issue) => issue.code === 'http.404')) return undefined;
  throw new BuildError(
    `Snapshot de ${site} indisponível: ${result.issues.map((issue) => issue.code).join(', ')}`,
    failureKind(result.issues),
  );
}

/** Snapshot do site, ou undefined se o site não existe. */
export function loadPreviewSite(
  site: string,
  env: SourceEnv,
  now: number = Date.now(),
): Promise<SiteData | undefined> {
  const hit = cache.get(site);
  if (hit && now - hit.at < PREVIEW_CACHE_MS) return hit.data;
  const data = read(site, env);
  cache.set(site, { at: now, data });
  // Falha não fica em cache: a próxima requisição tenta de novo.
  data.catch(() => cache.delete(site));
  return data;
}
