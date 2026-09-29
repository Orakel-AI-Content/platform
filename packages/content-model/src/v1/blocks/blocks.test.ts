import { describe, expect, it } from 'vitest';

import { BlockSchema, RichTextSchema } from './index.ts';

const text = (value: string) => ({ type: 'text', text: value });

describe('BlockSchema', () => {
  it.each([
    { n: 1, type: 'text', content: [{ type: 'paragraph', children: [text('Olá')] }] },
    { n: 2, type: 'toc' },
    { n: 3, type: 'quote', content: [text('Frase')], attribution: 'Alguém', sourceUrl: '/fonte/' },
    { n: 4, type: 'image', mediaId: 1, alt: 'Descrição', caption: [text('Legenda')] },
    { n: 5, type: 'image', mediaId: 1, decorative: true },
    { n: 6, type: 'faq', items: [{ question: 'Pergunta?', answer: [text('Resposta')] }] },
  ])('aceita o bloco $type', (block) => {
    expect(BlockSchema.safeParse(block).success).toBe(true);
  });

  it('recusa tipo desconhecido', () => {
    expect(BlockSchema.safeParse({ n: 1, type: 'video', url: '/x' }).success).toBe(false);
  });

  it('recusa bloco sem n positivo', () => {
    expect(BlockSchema.safeParse({ n: 0, type: 'toc' }).success).toBe(false);
    expect(BlockSchema.safeParse({ type: 'toc' }).success).toBe(false);
  });

  it('descarta campos desconhecidos em vez de falhar', () => {
    expect(BlockSchema.parse({ n: 1, type: 'toc', futuro: true })).toEqual({ n: 1, type: 'toc' });
  });

  describe('imagem', () => {
    it('exige texto alternativo quando não é decorativa', () => {
      const result = BlockSchema.safeParse({ n: 1, type: 'image', mediaId: 1 });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['alt']);
    });

    it('recusa alt em branco', () => {
      expect(BlockSchema.safeParse({ n: 1, type: 'image', mediaId: 1, alt: '   ' }).success).toBe(
        false,
      );
    });

    it('recusa alt em imagem decorativa', () => {
      const block = { n: 1, type: 'image', mediaId: 1, alt: 'x', decorative: true };
      expect(BlockSchema.safeParse(block).success).toBe(false);
    });
  });
});

describe('RichTextSchema', () => {
  it('aceita parágrafo com marcas e link, intertítulos e listas', () => {
    const richText = [
      { type: 'heading', level: 2, children: [text('Título')] },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'negrito', marks: ['bold', 'italic'] },
          { type: 'link', href: 'https://exemplo.org', children: [text('link')] },
        ],
      },
      { type: 'list', ordered: false, items: [[text('item')]] },
    ];
    expect(RichTextSchema.safeParse(richText).success).toBe(true);
  });

  it.each([
    ['vazio', []],
    ['intertítulo h1', [{ type: 'heading', level: 1, children: [text('x')] }]],
    [
      'marca fora da lista',
      [{ type: 'paragraph', children: [{ type: 'text', text: 'x', marks: ['underline'] }] }],
    ],
    [
      'link com esquema perigoso',
      [
        {
          type: 'paragraph',
          children: [{ type: 'link', href: 'javascript:x', children: [text('x')] }],
        },
      ],
    ],
    ['HTML livre', [{ type: 'html', value: '<b>x</b>' }]],
  ])('recusa %s', (_, richText) => {
    expect(RichTextSchema.safeParse(richText).success).toBe(false);
  });
});
