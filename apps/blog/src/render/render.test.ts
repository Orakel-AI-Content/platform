import type { Block } from '@orakel/content-model/v1';
import { describe, expect, it } from 'vitest';

import { formatDate } from './dates.ts';
import { sitePath, splitPreviewPath } from './links.ts';
import { pageType } from './page-type.ts';
import { headingId, tocEntries } from './toc.ts';

describe('links', () => {
  it('prefixa só caminhos internos', () => {
    expect(sitePath('/exemplo-a', '/sobre/')).toBe('/exemplo-a/sobre/');
    expect(sitePath('', '/sobre/')).toBe('/sobre/');
    expect(sitePath('/exemplo-a', 'https://exemplo.org/')).toBe('https://exemplo.org/');
    expect(sitePath('/exemplo-a', '//cdn.exemplo.org/x')).toBe('//cdn.exemplo.org/x');
  });

  it('separa o site do caminho na visualização', () => {
    expect(splitPreviewPath('/exemplo-a/')).toEqual({ site: 'exemplo-a', path: '/' });
    expect(splitPreviewPath('/exemplo-a/categoria/guias/')).toEqual({
      site: 'exemplo-a',
      path: '/categoria/guias/',
    });
    expect(splitPreviewPath('/')).toBeUndefined();
    expect(splitPreviewPath('/Exemplo_A/')).toBeUndefined();
  });
});

describe('sumário', () => {
  it('ids estáveis pelo número do bloco e ordem dos intertítulos', () => {
    const text = (content: string) => [{ type: 'text' as const, text: content }];
    const blocks: Block[] = [
      { n: 1, type: 'toc' },
      {
        n: 4,
        type: 'text',
        content: [
          { type: 'heading', level: 2, children: text('Começo') },
          { type: 'paragraph', children: text('…') },
          {
            type: 'heading',
            level: 3,
            children: [{ type: 'link', href: '/x/', children: text('Detalhe') }],
          },
        ],
      },
    ];
    expect(tocEntries(blocks)).toEqual([
      { id: headingId(4, 0), level: 2, text: 'Começo' },
      { id: 'secao-4-2', level: 3, text: 'Detalhe' },
    ]);
  });
});

describe('datas e tipos de página', () => {
  it('formata no fuso do site', () => {
    expect(
      formatDate('2026-09-20T01:00:00Z', { language: 'pt-BR', timeZone: 'America/Sao_Paulo' }),
    ).toBe('19 de setembro de 2026');
  });

  it('declara o tipo de cada página para o orçamento de JS', () => {
    expect(pageType({ type: 'search' })).toBe('busca');
    expect(pageType({ type: 'not-found' })).toBe('404');
    expect(
      pageType({
        type: 'taxonomy',
        taxonomy: { id: 1, kind: 'series', slug: 's', name: 'S' },
        items: [],
        page: 1,
        totalPages: 1,
      }),
    ).toBe('serie');
  });
});
