// robots.txt (P10; ADR 0005): libera tudo, bloqueia o treinamento de IA pela lista da
// plataforma com a sobrescrita do site. Com `indexavel` desligado o arquivo é o mesmo:
// bloquear o rastreio impediria o buscador de ver o noindex (`12.1`, seção 4).
import type { Snapshot } from '@orakel/content-model/v1';
import { CRAWLERS_REVIEWED_AT, blockedUserAgents } from '../crawlers.ts';
import { SITEMAP_INDEX_PATH } from './sitemap.ts';
import { absoluteUrl } from './site.ts';

export const ROBOTS_PATH = '/robots.txt';

export function robotsTxt(snapshot: Pick<Snapshot, 'config'>): string {
  const blocked = blockedUserAgents(snapshot.config.crawlers);
  const lines = [
    `# Gerado pela plataforma (lista de crawlers revisada em ${CRAWLERS_REVIEWED_AT}).`,
    'User-agent: *',
    'Allow: /',
    '',
  ];
  if (blocked.length > 0) {
    lines.push(
      '# Treinamento de IA',
      ...blocked.map((agent) => `User-agent: ${agent}`),
      'Disallow: /',
      '',
    );
  }
  lines.push(`Sitemap: ${absoluteUrl(snapshot.config, SITEMAP_INDEX_PATH)}`);
  return `${lines.join('\n')}\n`;
}
