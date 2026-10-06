import { describe, expect, it } from 'vitest';

import { toAuthor, toContent, toMedia, toRedirect, toTaxonomy } from './mappers.ts';

describe('linhas do banco → entidades do contrato', () => {
  it('coluna nula vira campo ausente, nunca null', () => {
    const author = toAuthor({
      siteId: 's',
      id: 1,
      slug: 'ana',
      name: 'Ana',
      bio: null,
      expertise: 'Guias',
      avatarMediaId: null,
    });
    expect(author).toEqual({ id: 1, slug: 'ana', name: 'Ana', expertise: 'Guias' });
    expect(
      toTaxonomy({ siteId: 's', id: 2, kind: 'tag', slug: 't', name: 'T', description: null }),
    ).toEqual({
      id: 2,
      kind: 'tag',
      slug: 't',
      name: 'T',
    });
  });

  it('mídia leva só largura, formato e caminho das variantes (sem o original)', () => {
    expect(
      toMedia({ siteId: 's', id: 3, width: 100, height: 50, originalKey: 's/abc.jpg' }, [
        { siteId: 's', mediaId: 3, width: 320, format: 'avif', path: 's/x-320.avif' },
      ]),
    ).toEqual({
      id: 3,
      width: 100,
      height: 50,
      variants: [{ width: 320, format: 'avif', path: 's/x-320.avif' }],
    });
  });

  it('redirect e conteúdo', () => {
    expect(
      toRedirect({ siteId: 's', id: 4, from: '/a/', to: '/b/', status: 301, origin: 'manual' }),
    ).toEqual({
      id: 4,
      from: '/a/',
      to: '/b/',
      status: 301,
      origin: 'manual',
    });
    const data = {
      kind: 'page' as const,
      slug: 'sobre',
      title: 'Sobre',
      authorIds: [],
      taxonomyIds: [],
      publishedAt: '2026-09-01T10:00:00-03:00',
      blocks: [{ n: 1, type: 'toc' as const }],
    };
    expect(toContent({ contentId: 5, data })).toEqual({ id: 5, ...data });
  });
});
