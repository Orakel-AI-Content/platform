import type {
  Author,
  Content,
  Media,
  Menu,
  Redirect,
  SiteConfig,
  Taxonomy,
} from '../entities/index.ts';
import type { HeaderLine } from '../snapshot.ts';

/** Snapshot de um site já montado a partir das linhas do NDJSON. */
export type Snapshot = {
  header: HeaderLine;
  config: SiteConfig;
  authors: Author[];
  taxonomies: Taxonomy[];
  menus: Menu[];
  media: Media[];
  redirects: Redirect[];
  contents: Content[];
};

/** IDs conhecidos no site, para conferir as referências de um conteúdo isolado. */
export type ReferenceContext = {
  authorIds: ReadonlySet<number>;
  taxonomyIds: ReadonlySet<number>;
  mediaIds: ReadonlySet<number>;
};
