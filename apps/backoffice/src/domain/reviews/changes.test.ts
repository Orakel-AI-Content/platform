import type { Block } from '@orakel/content-model/v1';
import { describe, expect, it } from 'vitest';

import type { ContentData } from '../../db/schema/index.ts';
import { compareVersions, sameJson } from './changes.ts';

// O que mudou entre duas versões (#768): campos alterados e blocos pareados pelo `n`.

const text = (n: number, value: string): Block => ({
  n,
  type: 'text',
  content: [{ type: 'paragraph', children: [{ type: 'text', text: value }] }],
});

const data = (overrides: Partial<ContentData> = {}): ContentData => ({
  kind: 'article',
  slug: 'guia',
  title: 'Guia completo',
  description: 'Tudo para começar.',
  authorIds: [1],
  taxonomyIds: [1, 2],
  coverMediaId: 1,
  publishedAt: '2026-09-20T10:00:00-03:00',
  seo: { title: 'Guia', description: 'Resumo' },
  blocks: [text(1, 'Olá'), { n: 2, type: 'toc' }, text(3, 'Fim')],
  ...overrides,
});

describe('compareVersions', () => {
  it('dados iguais devolvem as duas listas vazias', () => {
    expect(compareVersions(data(), data())).toEqual({ fields: [], blocks: [] });
  });

  it('aponta cada metadado alterado, com o antes e o depois, na ordem da revisão', () => {
    const after = data({
      title: 'Guia revisto',
      description: undefined,
      taxonomyIds: [3],
      coverMediaId: 2,
      publishedAt: '2026-09-21T10:00:00-03:00',
      seo: { title: 'Guia', description: 'Outro resumo', canonical: '/guia-antigo/' },
    });

    expect(compareVersions(data(), after).fields).toEqual([
      { field: 'title', before: 'Guia completo', after: 'Guia revisto' },
      { field: 'description', before: 'Tudo para começar.', after: undefined },
      { field: 'taxonomyIds', before: [1, 2], after: [3] },
      { field: 'coverMediaId', before: 1, after: 2 },
      {
        field: 'publishedAt',
        before: '2026-09-20T10:00:00-03:00',
        after: '2026-09-21T10:00:00-03:00',
      },
      { field: 'seoDescription', before: 'Resumo', after: 'Outro resumo' },
      { field: 'seoCanonical', before: undefined, after: '/guia-antigo/' },
    ]);
  });

  it('ignora campos fora da lista e a ordem das taxonomias', () => {
    const after = data({ slug: 'outro', authorIds: [2], kind: 'page', taxonomyIds: [2, 1] });

    expect(compareVersions(data(), after).fields).toEqual([]);
  });

  it('pareia os blocos pelo n: adicionado, removido e alterado, em ordem de n', () => {
    const after = data({
      blocks: [text(1, 'Olá de novo'), { n: 2, type: 'toc' }, text(4, 'Novo')],
    });

    expect(compareVersions(data(), after).blocks).toEqual([
      { n: 1, kind: 'alterado', before: text(1, 'Olá'), after: text(1, 'Olá de novo') },
      { n: 3, kind: 'removido', before: text(3, 'Fim') },
      { n: 4, kind: 'adicionado', after: text(4, 'Novo') },
    ]);
  });

  it('mover um bloco sem mudá-lo não é mudança; trocar o tipo no mesmo n é alteração', () => {
    const moved = data({ blocks: [text(3, 'Fim'), text(1, 'Olá'), { n: 2, type: 'toc' }] });
    expect(compareVersions(data(), moved).blocks).toEqual([]);

    const retyped = data({ blocks: [text(1, 'Olá'), text(2, 'Sumário'), text(3, 'Fim')] });
    expect(compareVersions(data(), retyped).blocks).toEqual([
      { n: 2, kind: 'alterado', before: { n: 2, type: 'toc' }, after: text(2, 'Sumário') },
    ]);
  });
});

describe('sameJson', () => {
  it('compara pela estrutura, sem depender da ordem das chaves, e trata undefined como ausente', () => {
    expect(sameJson({ a: 1, b: [1, { c: 'x' }] }, { b: [1, { c: 'x' }], a: 1 })).toBe(true);
    expect(sameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
    expect(sameJson({ a: [1] }, { a: { 0: 1 } })).toBe(false);
    expect(sameJson(null, {})).toBe(false);
  });
});
