// Arquivos gerados da borda, num passo só para o blog gravar na saída do build: robots.txt,
// _redirects, _headers, rss.xml e os sitemaps. Colisões de rota e excesso de redirects
// voltam como problemas; o render trata como falha permanente (código 10).
import type { Snapshot } from '@orakel/content-model/v1';
import { fail, ok, type Result } from '../result.ts';
import { headersFile, HEADERS_PATH } from './headers.ts';
import { redirectsFile, type RedirectUsage } from './redirects.ts';
import { robotsTxt, ROBOTS_PATH } from './robots.ts';
import { routeConflicts } from './routes.ts';
import { rss } from './rss.ts';
import { sitemaps } from './sitemap.ts';

export type EdgeFile = { path: string; content: string };

export function edgeFiles(
  snapshot: Snapshot,
): Result<{ files: EdgeFile[]; redirectUsage: RedirectUsage }> {
  const redirects = redirectsFile(snapshot);
  const issues = [...routeConflicts(snapshot), ...(redirects.ok ? [] : redirects.issues)];
  if (!redirects.ok || issues.length > 0) return fail(issues);

  const feed = rss(snapshot);
  return ok({
    files: [
      { path: ROBOTS_PATH, content: robotsTxt(snapshot) },
      { path: redirects.value.path, content: redirects.value.content },
      { path: HEADERS_PATH, content: headersFile(snapshot) },
      { path: feed.path, content: feed.xml },
      ...sitemaps(snapshot).map((file) => ({ path: file.path, content: file.xml })),
    ],
    redirectUsage: redirects.value.usage,
  });
}
