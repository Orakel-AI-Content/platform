import type { Issue } from '../../../result.ts';
import type { Snapshot } from '../types.ts';

const CODE = 'semantic.unique-slugs';

/**
 * Slugs e caminhos únicos no site: conteúdos (artigos e páginas dividem `/<slug>/`),
 * autores, taxonomias por tipo, chaves de menu e origens de redirect. Um conteúdo também
 * não pode ocupar a origem de um redirect.
 */
export function checkUniqueSlugs(snapshot: Snapshot): Issue[] {
  const issues: Issue[] = [];

  const unique = <T>(items: readonly T[], key: (item: T) => string, path: string, what: string) => {
    const seen = new Map<string, number>();
    items.forEach((item, i) => {
      const value = key(item);
      const first = seen.get(value);
      if (first === undefined) {
        seen.set(value, i);
        return;
      }
      issues.push({
        code: CODE,
        message: `${what} "${value}" repetido (${path}[${first}])`,
        path: [path, i],
      });
    });
    return seen;
  };

  unique(snapshot.contents, (content) => content.slug, 'contents', 'Slug de conteúdo');
  unique(snapshot.authors, (author) => author.slug, 'authors', 'Slug de autor');
  unique(
    snapshot.taxonomies,
    (taxonomy) => `${taxonomy.kind}/${taxonomy.slug}`,
    'taxonomies',
    'Slug de taxonomia',
  );
  unique(snapshot.menus, (menu) => menu.key, 'menus', 'Chave de menu');
  const redirectOrigins = unique(
    snapshot.redirects,
    (redirect) => redirect.from,
    'redirects',
    'Origem de redirect',
  );

  snapshot.contents.forEach((content, i) => {
    if (redirectOrigins.has(`/${content.slug}/`)) {
      issues.push({
        code: CODE,
        message: `O conteúdo /${content.slug}/ colide com a origem de um redirect`,
        path: ['contents', i, 'slug'],
      });
    }
  });

  return issues;
}
