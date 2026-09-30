// RSS 2.0 dos últimos artigos (ADR 0009): só o resumo, guid estável pelo ID (a troca de
// slug não republica o item) e lastBuildDate pela publicação mais recente (idempotência).
import type { Snapshot } from '@orakel/content-model/v1';
import { XML_DECLARATION, escapeXml } from '../xml.ts';
import { contentAuthors } from './json-ld.ts';
import { contentPath, homePath } from './routes.ts';
import { absoluteUrl, lookups } from './site.ts';

export const RSS_PATH = '/rss.xml';
export const RSS_ITEMS = 20;

/** RFC 822, como o RSS 2.0 exige. */
const rfc822 = (iso: string) => new Date(iso).toUTCString();

const element = (name: string, value: string | undefined) =>
  value === undefined ? '' : `<${name}>${escapeXml(value)}</${name}>`;

export function rss(snapshot: Snapshot, limit = RSS_ITEMS): { path: string; xml: string } {
  const { config } = snapshot;
  const { taxonomy } = lookups(snapshot);
  const articles = snapshot.contents
    .filter((content) => content.kind === 'article')
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.id - a.id)
    .slice(0, limit);

  const items = articles.map((content) => {
    const url = absoluteUrl(config, contentPath(content));
    const creators = contentAuthors(snapshot, content).map((author) =>
      element('dc:creator', author.name),
    );
    const categories = content.taxonomyIds.flatMap((id) => {
      const item = taxonomy.get(id);
      return item ? [element('category', item.name)] : [];
    });
    return (
      `    <item>` +
      element('title', content.title) +
      element('link', url) +
      `<guid isPermaLink="false">${escapeXml(`${config.siteId}:${content.id}`)}</guid>` +
      element('pubDate', rfc822(content.publishedAt)) +
      element('description', content.seo?.description ?? content.description) +
      creators.join('') +
      categories.join('') +
      `</item>\n`
    );
  });

  const latest = articles[0];
  const channel =
    `  <channel>\n` +
    `    ${element('title', config.name)}\n` +
    `    ${element('link', absoluteUrl(config, homePath()))}\n` +
    `    ${element('description', config.name)}\n` +
    `    ${element('language', config.language)}\n` +
    (latest ? `    ${element('lastBuildDate', rfc822(latest.publishedAt))}\n` : '') +
    `    <atom:link href="${escapeXml(absoluteUrl(config, RSS_PATH))}" rel="self" type="application/rss+xml"/>\n` +
    items.join('') +
    `  </channel>\n`;

  return {
    path: RSS_PATH,
    xml:
      `${XML_DECLARATION}\n` +
      `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
      channel +
      `</rss>\n`,
  };
}
