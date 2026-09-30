// Sitemap índice + um arquivo por tipo, só com páginas indexáveis (ADR 0008): sem paginação,
// busca nem 404; taxonomias e autores só com conteúdo. Com `indexavel` desligado, o índice
// sai vazio, para o sitemap nunca contradizer o noindex.
import type { Content, Snapshot } from '@orakel/content-model/v1';
import { XML_DECLARATION, escapeXml } from '../xml.ts';
import { authorPath, contentPath, homePath, institutionalPages, taxonomyPath } from './routes.ts';
import { absoluteUrl } from './site.ts';

export const SITEMAP_INDEX_PATH = '/sitemap.xml';
/** Limite do protocolo por arquivo. */
export const SITEMAP_MAX_URLS = 50_000;

export type SitemapFile = { path: string; xml: string };

type Entry = { path: string; lastmod?: string | undefined };

const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

const lastmodOf = (content: Content) => content.updatedAt ?? content.publishedAt;

/** Maior data entre ISO 8601 com fuso: compara pelo instante, devolve o texto original. */
function latest(dates: readonly (string | undefined)[]): string | undefined {
  let best: string | undefined;
  for (const date of dates) {
    if (date !== undefined && (best === undefined || Date.parse(date) > Date.parse(best))) {
      best = date;
    }
  }
  return best;
}

function groups(snapshot: Snapshot): [string, Entry[]][] {
  const articles = snapshot.contents.filter((content) => content.kind === 'article');
  const pages = snapshot.contents.filter((content) => content.kind === 'page');
  const byTaxonomy = new Map<number, Content[]>();
  const byAuthor = new Map<number, Content[]>();
  for (const content of snapshot.contents) {
    for (const id of content.taxonomyIds)
      byTaxonomy.set(id, [...(byTaxonomy.get(id) ?? []), content]);
    for (const id of content.authorIds) byAuthor.set(id, [...(byAuthor.get(id) ?? []), content]);
  }
  const taxonomies = (kind: 'category' | 'tag' | 'series'): Entry[] =>
    snapshot.taxonomies
      .filter((taxonomy) => taxonomy.kind === kind && byTaxonomy.has(taxonomy.id))
      .map((taxonomy) => ({
        path: taxonomyPath(taxonomy),
        lastmod: latest((byTaxonomy.get(taxonomy.id) ?? []).map(lastmodOf)),
      }));

  return [
    [
      'artigos',
      articles.map((content) => ({ path: contentPath(content), lastmod: lastmodOf(content) })),
    ],
    [
      'paginas',
      [
        { path: homePath(), lastmod: latest(snapshot.contents.map(lastmodOf)) },
        ...pages.map((content) => ({ path: contentPath(content), lastmod: lastmodOf(content) })),
        ...institutionalPages(snapshot).map((page) => ({ path: page.path })),
      ],
    ],
    ['categorias', taxonomies('category')],
    ['tags', taxonomies('tag')],
    ['series', taxonomies('series')],
    [
      'autores',
      snapshot.authors
        .filter((author) => byAuthor.has(author.id))
        .map((author) => ({
          path: authorPath(author),
          lastmod: latest((byAuthor.get(author.id) ?? []).map(lastmodOf)),
        })),
    ],
  ];
}

function urlset(snapshot: Snapshot, entries: readonly Entry[]): string {
  const urls = entries.map(
    (entry) =>
      `  <url><loc>${escapeXml(absoluteUrl(snapshot.config, entry.path))}</loc>` +
      (entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : '') +
      `</url>`,
  );
  return `${XML_DECLARATION}\n<urlset xmlns="${SITEMAP_NS}">\n${urls.map((url) => `${url}\n`).join('')}</urlset>\n`;
}

/** Arquivos do sitemap: o índice primeiro, depois um por tipo (divididos em 50.000 URLs). */
export function sitemaps(snapshot: Snapshot, maxUrls = SITEMAP_MAX_URLS): SitemapFile[] {
  const files: SitemapFile[] = [];
  const index: Entry[] = [];

  if (snapshot.config.indexavel) {
    for (const [name, entries] of groups(snapshot)) {
      const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : 1));
      for (let start = 0, part = 1; start < sorted.length; start += maxUrls, part += 1) {
        const chunk = sorted.slice(start, start + maxUrls);
        const path = `/sitemap-${name}${part === 1 ? '' : `-${part}`}.xml`;
        files.push({ path, xml: urlset(snapshot, chunk) });
        index.push({ path, lastmod: latest(chunk.map((entry) => entry.lastmod)) });
      }
    }
  }

  const sitemapsXml = index.map(
    (entry) =>
      `  <sitemap><loc>${escapeXml(absoluteUrl(snapshot.config, entry.path))}</loc>` +
      (entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : '') +
      `</sitemap>\n`,
  );
  const indexXml = `${XML_DECLARATION}\n<sitemapindex xmlns="${SITEMAP_NS}">\n${sitemapsXml.join('')}</sitemapindex>\n`;
  return [{ path: SITEMAP_INDEX_PATH, xml: indexXml }, ...files];
}
