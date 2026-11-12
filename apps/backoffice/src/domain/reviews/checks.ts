import type { Issue } from '@orakel/content-model';
import type { Block, Inline, SiteConfig, Taxonomy } from '@orakel/content-model/v1';
import {
  authorPath,
  contentPath,
  homePath,
  institutionalPages,
  isDynamicRedirect,
  SEARCH_PATH,
  taxonomyPath,
} from '@orakel/core/v1';

import type { ContentData } from '../../db/schema/index.ts';

// Checagens automáticas da revisão (workspace#87): calculadas ao abrir a revisão, nunca
// gravadas, porque links internos e título duplicado dependem dos outros conteúdos do site.
// Só o que `validateContentData` já acusa é `erro` (é o que barra a aprovação); o resto é
// `aviso`. Função pura: quem lê o banco é `reviewChecks`, em `reviews.ts`.

/** Limites do texto efetivo de SEO (`seo.*` ou o campo base), em caracteres. */
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 160;

export const REVIEW_CHECKS = [
  { key: 'imagens', label: 'Descrição das imagens ou marcação como decorativas' },
  { key: 'capa', label: 'Imagem de capa' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'descricao', label: 'Descrição' },
  { key: 'seo_titulo', label: `Título de SEO com até ${SEO_TITLE_MAX} caracteres` },
  {
    key: 'seo_descricao',
    label: `Descrição de SEO com até ${SEO_DESCRIPTION_MAX} caracteres`,
  },
  { key: 'links_internos', label: 'Links internos levam a páginas do site' },
  { key: 'titulo_duplicado', label: 'Título diferente dos outros conteúdos do site' },
  { key: 'validacao_release', label: 'Validação pela release do site' },
] as const;

export type ReviewCheckKey = (typeof REVIEW_CHECKS)[number]['key'];
export type ReviewCheckLevel = 'ok' | 'aviso' | 'erro';

/** Um problema da checagem: o que está errado e onde (campo ou bloco, como em `Issue.path`). */
export type ReviewCheckFinding = { message: string; path: PropertyKey[] };

export type ReviewCheck = {
  key: ReviewCheckKey;
  label: string;
  /** `ok` sem problema; senão, o nível da checagem. */
  level: ReviewCheckLevel;
  findings: ReviewCheckFinding[];
};

/** O que as checagens precisam saber do site, já lido do banco. */
export type ReviewCheckContext = {
  /** Caminhos que existem no site (`sitePaths`). */
  paths: SitePaths;
  /** IDs das taxonomias `category` do site. */
  categoryIds: ReadonlySet<number>;
  /** Título da versão mais recente de cada outro conteúdo do mesmo site. */
  otherTitles: readonly { contentId: number; title: string }[];
};

export type SitePaths = { static: ReadonlySet<string>; dynamic: readonly RegExp[] };

/** Barra final e sem query ou âncora: a forma das rotas do `@orakel/core`. */
function normalizePath(href: string): string {
  const path = href.split(/[?#]/, 1)[0] ?? href;
  return path.endsWith('/') ? path : `${path}/`;
}

/** Origem de um redirect dinâmico como expressão: `*` casa qualquer resto, `:nome` um segmento. */
function redirectPattern(from: string): RegExp {
  const source = from
    .replace(/\/$/, '')
    .split(/(\*|:[A-Za-z]\w*)/)
    .map((part) => {
      if (part === '*') return '.*';
      if (part.startsWith(':')) return '[^/]+';
      return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}/?$`);
}

/**
 * Caminhos do site pelas rotas do `@orakel/core`: início, busca, conteúdos no ar, taxonomias,
 * autores, institucionais com texto na configuração e origens dos redirects.
 */
export function sitePaths(site: {
  liveSlugs: readonly string[];
  taxonomies: readonly Pick<Taxonomy, 'kind' | 'slug'>[];
  authorSlugs: readonly string[];
  config: SiteConfig | undefined;
  redirectFroms: readonly string[];
}): SitePaths {
  const dynamicFroms = site.redirectFroms.filter((from) => isDynamicRedirect({ from }));
  return {
    static: new Set([
      homePath(),
      SEARCH_PATH,
      ...site.liveSlugs.map((slug) => contentPath({ slug })),
      ...site.taxonomies.map((taxonomy) => taxonomyPath(taxonomy)),
      ...site.authorSlugs.map((slug) => authorPath({ slug })),
      ...(site.config === undefined ? [] : institutionalPages({ config: site.config })).map(
        (page) => page.path,
      ),
      ...site.redirectFroms
        .filter((from) => !isDynamicRedirect({ from }))
        .map((from) => normalizePath(from)),
    ]),
    dynamic: dynamicFroms.map(redirectPattern),
  };
}

function isSitePath(paths: SitePaths, path: string): boolean {
  return paths.static.has(path) || paths.dynamic.some((pattern) => pattern.test(path));
}

/** `href` dos links do bloco, nos trechos de texto, citação e FAQ. */
function blockHrefs(block: Block): string[] {
  const hrefs = (inlines: readonly Inline[]) =>
    inlines.flatMap((inline) => (inline.type === 'link' ? [inline.href] : []));
  switch (block.type) {
    case 'text':
      return block.content.flatMap((node) =>
        node.type === 'list' ? node.items.flatMap(hrefs) : hrefs(node.children),
      );
    case 'quote':
      return hrefs(block.content);
    case 'faq':
      return block.items.flatMap((item) => hrefs(item.answer));
    default:
      return [];
  }
}

const isInternal = (href: string) => href.startsWith('/') && !href.startsWith('//');

const normalizeTitle = (title: string) => title.trim().toLocaleLowerCase('pt-BR');

/** Issue de validação no texto alternativo de um bloco de imagem (`blocks.<i>.alt`). */
function isImageIssue(data: ContentData, issue: Issue): boolean {
  const [root, index, field] = issue.path;
  return (
    root === 'blocks' &&
    typeof index === 'number' &&
    data.blocks[index]?.type === 'image' &&
    (field === 'alt' || field === 'decorative')
  );
}

/**
 * Checagens da versão, na ordem de `REVIEW_CHECKS`. `validation` são as issues de
 * `validateContentData` (vazio: sem erro); as de imagem saem em `imagens` e não se repetem em
 * `validacao_release`.
 */
export function computeReviewChecks(
  data: ContentData,
  validation: readonly Issue[],
  context: ReviewCheckContext,
): ReviewCheck[] {
  const finding = (message: string, path: PropertyKey[] = []): ReviewCheckFinding => ({
    message,
    path,
  });
  const imageIssues = validation.filter((issue) => isImageIssue(data, issue));
  const otherIssues = validation.filter((issue) => !isImageIssue(data, issue));

  const seoTitle = data.seo?.title ?? data.title;
  const seoDescription = data.seo?.description ?? data.description;
  const ownPath = contentPath(data);

  const brokenLinks = data.blocks.flatMap((block, index) =>
    blockHrefs(block)
      .filter(isInternal)
      .filter((href) => {
        const path = normalizePath(href);
        return path !== ownPath && !isSitePath(context.paths, path);
      })
      .map((href) =>
        finding(`O link para ${href} não leva a nenhuma página do site`, ['blocks', index]),
      ),
  );

  const title = normalizeTitle(data.title);
  const duplicates = context.otherTitles.filter((other) => normalizeTitle(other.title) === title);

  const findings: Record<ReviewCheckKey, ReviewCheckFinding[]> = {
    imagens: imageIssues.map((issue) => finding(issue.message, issue.path)),
    capa:
      data.coverMediaId === undefined
        ? [finding('O conteúdo não tem imagem de capa', ['coverMediaId'])]
        : [],
    categoria: data.taxonomyIds.some((id) => context.categoryIds.has(id))
      ? []
      : [finding('O conteúdo não tem categoria', ['taxonomyIds'])],
    descricao:
      data.description === undefined
        ? [finding('O conteúdo não tem descrição', ['description'])]
        : [],
    seo_titulo:
      seoTitle.length > SEO_TITLE_MAX
        ? [
            finding(
              `O título de SEO tem ${seoTitle.length} caracteres (máximo ${SEO_TITLE_MAX})`,
              data.seo?.title === undefined ? ['title'] : ['seo', 'title'],
            ),
          ]
        : [],
    seo_descricao:
      seoDescription !== undefined && seoDescription.length > SEO_DESCRIPTION_MAX
        ? [
            finding(
              `A descrição de SEO tem ${seoDescription.length} caracteres (máximo ${SEO_DESCRIPTION_MAX})`,
              data.seo?.description === undefined ? ['description'] : ['seo', 'description'],
            ),
          ]
        : [],
    links_internos: brokenLinks,
    titulo_duplicado: duplicates.map((other) =>
      finding(`O conteúdo ${other.contentId} tem o mesmo título`, ['title']),
    ),
    validacao_release: otherIssues.map((issue) => finding(issue.message, issue.path)),
  };

  const errorChecks: ReadonlySet<ReviewCheckKey> = new Set(['imagens', 'validacao_release']);
  return REVIEW_CHECKS.map(({ key, label }) => ({
    key,
    label,
    level: findings[key].length === 0 ? 'ok' : errorChecks.has(key) ? 'erro' : 'aviso',
    findings: findings[key],
  }));
}
