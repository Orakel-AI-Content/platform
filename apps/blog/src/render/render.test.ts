import type { Block } from '@orakel/content-model/v1';
import { describe, expect, it } from 'vitest';

import { formatDate } from './dates.ts';
import { fallbackVariant, pictureFormats } from './image.ts';
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

describe('imagem', () => {
  const media = (width: number, widths: number[]) => ({
    id: 1,
    width,
    height: width,
    variants: widths.flatMap((w) =>
      ['avif', 'webp'].map((format) => ({ width: w, format, path: `m1-${w}.${format}` })),
    ),
  });

  it('AVIF antes de WebP nos <source>', () => {
    expect(pictureFormats(media(1920, [320, 640]))).toEqual(['avif', 'webp']);
  });

  it('o <img> usa WebP a partir de 960 px', () => {
    expect(fallbackVariant(media(2560, [320, 640, 960, 1280, 1920]))?.path).toBe('m1-960.webp');
  });

  it('mídia sem variante de 960 px: o <img> usa a maior WebP, nunca AVIF', () => {
    expect(fallbackVariant(media(800, [320, 640]))?.path).toBe('m1-640.webp');
    expect(fallbackVariant(media(200, [200]))?.path).toBe('m1-200.webp');
  });
});
