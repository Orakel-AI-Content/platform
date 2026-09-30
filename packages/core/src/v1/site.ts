// URLs absolutas do site e da mídia. O primeiro domínio da configuração é o canonical.
import type { Media, SiteConfig, Snapshot } from '@orakel/content-model/v1';

type Domains = Pick<SiteConfig, 'domains'>;

function primaryDomain(config: Domains): string {
  const [domain] = config.domains;
  // O schema exige pelo menos um domínio; isto só protege contra uso fora do contrato.
  if (domain === undefined) throw new Error('Configuração do site sem domínio');
  return domain;
}

export function siteOrigin(config: Domains): string {
  return `https://${primaryDomain(config)}`;
}

/** Caminho do site (`/x/`) ou URL já absoluta → URL absoluta. */
export function absoluteUrl(config: Domains, pathOrUrl: string): string {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${siteOrigin(config)}${pathOrUrl}`;
}

/** Imagens são servidas de `media.<domínio>` (ADR-006 da plataforma). */
export function mediaUrl(config: Domains, variantPath: string): string {
  return `https://media.${primaryDomain(config)}/${variantPath}`;
}

/** Formatos preferidos para JSON-LD e Open Graph, do mais aceito ao menos aceito. */
const SHARE_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'avif'];

export type ShareImage = { url: string; width: number; height: number };

/** Maior variante no formato mais aceito, com a altura proporcional ao original. */
export function shareImage(config: Domains, media: Media): ShareImage | undefined {
  const rank = (format: string) => {
    const index = SHARE_FORMATS.indexOf(format.toLowerCase());
    return index === -1 ? SHARE_FORMATS.length : index;
  };
  const [best] = [...media.variants].sort(
    (a, b) => rank(a.format) - rank(b.format) || b.width - a.width,
  );
  if (!best) return undefined;
  return {
    url: mediaUrl(config, best.path),
    width: best.width,
    height: Math.round((best.width * media.height) / media.width),
  };
}

/** Índices por ID das entidades referenciadas pelos conteúdos. */
export function lookups(snapshot: Pick<Snapshot, 'authors' | 'taxonomies' | 'media'>) {
  return {
    author: new Map(snapshot.authors.map((author) => [author.id, author])),
    taxonomy: new Map(snapshot.taxonomies.map((taxonomy) => [taxonomy.id, taxonomy])),
    media: new Map(snapshot.media.map((media) => [media.id, media])),
  };
}
