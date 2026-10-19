import { readFileSync } from 'node:fs';

import {
  InlinesSchema,
  RichTextSchema,
  type Inline,
  type RichText,
} from '@orakel/content-model/v1';
import { describe, expect, it } from 'vitest';

import {
  inlinesDocFromTipTap,
  inlinesDocToTipTap,
  richTextFromTipTap,
  richTextToTipTap,
  type TipTapNode,
} from './richTextConvert.ts';

// Ida e volta TipTap ↔ content-model, sem DOM (#43).

/** Todas as árvores de rich text e sequências de inlines das fixtures do content-model. */
function fixtureTrees(): { richText: RichText[]; inlines: Inline[][] } {
  const richText: RichText[] = [];
  const inlines: Inline[][] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value) && value.length > 0) {
      const asRich = RichTextSchema.safeParse(value);
      if (asRich.success) return void richText.push(asRich.data);
      const asInlines = InlinesSchema.safeParse(value);
      if (asInlines.success) return void inlines.push(asInlines.data);
    }
    if (value !== null && typeof value === 'object') Object.values(value).forEach(walk);
  };
  for (const site of ['exemplo-a', 'exemplo-b']) {
    const url = import.meta.resolve(`@orakel/content-model/fixtures/v1/${site}.ndjson`);
    for (const line of readFileSync(new URL(url), 'utf8').split('\n')) {
      if (line.trim() !== '') walk(JSON.parse(line) as unknown);
    }
  }
  return { richText, inlines };
}

const { richText, inlines } = fixtureTrees();

describe('conversão de rich text', () => {
  it('as fixtures têm árvores para conferir', () => {
    expect(richText.length).toBeGreaterThan(0);
    expect(inlines.length).toBeGreaterThan(0);
  });

  it.each(richText.map((tree, i) => [i, tree] as const))(
    'rich text %i: ida e volta idêntica',
    (_, tree) => {
      expect(richTextFromTipTap(richTextToTipTap(tree))).toEqual(tree);
    },
  );

  it.each(inlines.map((seq, i) => [i, seq] as const))(
    'inlines %i: ida e volta idêntica',
    (_, seq) => {
      expect(inlinesDocFromTipTap(inlinesDocToTipTap(seq))).toEqual(seq);
    },
  );

  it('marca code e link com marcas voltam idênticos', () => {
    const tree: RichText = [
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Rode ' },
          { type: 'text', text: 'pnpm test', marks: ['bold', 'code'] },
          { type: 'text', text: ' e veja ' },
          {
            type: 'link',
            href: '/guia/',
            children: [
              { type: 'text', text: 'o guia', marks: ['italic'] },
              { type: 'text', text: ' completo' },
            ],
          },
        ],
      },
      { type: 'heading', level: 3, children: [{ type: 'text', text: 'Passos' }] },
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'text', text: 'um' }], [{ type: 'text', text: 'dois', marks: ['bold'] }]],
      },
    ];
    expect(richTextFromTipTap(richTextToTipTap(tree))).toEqual(tree);
  });

  it('normaliza a volta: funde trechos, ordena marcas, tira link inválido e parágrafo vazio', () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [
        { type: 'paragraph' },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a', marks: [{ type: 'italic' }, { type: 'bold' }] },
            { type: 'text', text: 'b', marks: [{ type: 'bold' }, { type: 'italic' }] },
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    };
    const result = richTextFromTipTap(doc);
    expect(result).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'ab', marks: ['bold', 'italic'] },
          { type: 'text', text: 'x' },
        ],
      },
    ]);
    expect(RichTextSchema.safeParse(result).success).toBe(true);
  });
});
