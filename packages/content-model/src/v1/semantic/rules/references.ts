import type { Issue } from '../../../result.ts';
import type { Content } from '../../entities/index.ts';
import type { ReferenceContext, Snapshot } from '../types.ts';

const CODE = 'semantic.references';

/** Autores, taxonomias e mídias citados por um conteúdo existem no site. */
export function checkContentReferences(
  content: Content,
  context: ReferenceContext,
  basePath: PropertyKey[] = [],
): Issue[] {
  const issues: Issue[] = [];
  const missing = (path: PropertyKey[], what: string, id: number) =>
    issues.push({
      code: CODE,
      message: `${what} ${id} não existe no site`,
      path: [...basePath, ...path],
    });

  content.authorIds.forEach((id, i) => {
    if (!context.authorIds.has(id)) missing(['authorIds', i], 'Autor', id);
  });
  content.taxonomyIds.forEach((id, i) => {
    if (!context.taxonomyIds.has(id)) missing(['taxonomyIds', i], 'Taxonomia', id);
  });
  if (content.coverMediaId !== undefined && !context.mediaIds.has(content.coverMediaId)) {
    missing(['coverMediaId'], 'Mídia', content.coverMediaId);
  }
  content.blocks.forEach((block, i) => {
    if (block.type === 'image' && !context.mediaIds.has(block.mediaId)) {
      missing(['blocks', i, 'mediaId'], 'Mídia', block.mediaId);
    }
  });
  return issues;
}

/** Referências de todo o snapshot: conteúdos e avatares de autores. */
export function checkReferences(snapshot: Snapshot): Issue[] {
  const context: ReferenceContext = {
    authorIds: new Set(snapshot.authors.map((author) => author.id)),
    taxonomyIds: new Set(snapshot.taxonomies.map((taxonomy) => taxonomy.id)),
    mediaIds: new Set(snapshot.media.map((media) => media.id)),
  };
  const issues = snapshot.contents.flatMap((content, i) =>
    checkContentReferences(content, context, ['contents', i]),
  );
  snapshot.authors.forEach((author, i) => {
    if (author.avatarMediaId !== undefined && !context.mediaIds.has(author.avatarMediaId)) {
      issues.push({
        code: CODE,
        message: `Mídia ${author.avatarMediaId} não existe no site`,
        path: ['authors', i, 'avatarMediaId'],
      });
    }
  });
  return issues;
}
