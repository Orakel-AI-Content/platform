// @vitest-environment happy-dom
import { InlinesSchema, RichTextSchema } from '@orakel/content-model/v1';
import { generateJSON } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { inlinesDocFromTipTap, richTextFromTipTap, type TipTapNode } from './richTextConvert.ts';
import { richTextExtensions } from './richTextExtensions.ts';

// Colar HTML: o schema do editor descarta o que o RichTextSchema não aceita (#43).

const pasted = `
  <h1>Título grande</h1>
  <p style="color:red">Texto <span style="font-size:40px">grande</span> com <b>negrito</b>,
    <u>sublinhado</u> e <a href="javascript:alert(1)">link perigoso</a>.</p>
  <table><tr><td>célula</td></tr></table>
  <img src="x.png" alt="imagem">
  <ul><li>item <ul><li>aninhado</li></ul></li></ul>
  <h3>Intertítulo <a href="https://exemplo.com/">com link</a></h3>
  <pre><code>bloco</code></pre>
`;

const types = (node: TipTapNode): string[] => [
  node.type,
  ...(node.marks ?? []).map((mark) => `mark:${mark.type}`),
  ...(node.content ?? []).flatMap(types),
];

describe('extensões do editor', () => {
  it('richText: colar HTML deixa só nós aceitos e um valor válido', () => {
    const doc = generateJSON(pasted, richTextExtensions('richText')) as TipTapNode;

    const allowed = new Set([
      'doc',
      'paragraph',
      'text',
      'heading',
      'bulletList',
      'orderedList',
      'listItem',
      'mark:bold',
      'mark:italic',
      'mark:code',
      'mark:link',
    ]);
    expect(types(doc).filter((type) => !allowed.has(type))).toEqual([]);

    const value = richTextFromTipTap(doc);
    expect(RichTextSchema.safeParse(value).success).toBe(true);
    expect(JSON.stringify(value)).not.toContain('javascript:');
    expect(JSON.stringify(value)).toContain('https://exemplo.com/');
    // h1 não existe no schema: vira intertítulo 2 ou parágrafo, nunca nível 1.
    expect(value.some((node) => node.type === 'heading' && (node.level as number) === 1)).toBe(
      false,
    );
  });

  it('inlines: colar blocos deixa um parágrafo só e um valor válido', () => {
    const doc = generateJSON(pasted, richTextExtensions('inlines')) as TipTapNode;

    expect(doc.content?.map((node) => node.type)).toEqual(['paragraph']);
    expect(types(doc).some((type) => ['heading', 'bulletList', 'orderedList'].includes(type))).toBe(
      false,
    );
    expect(InlinesSchema.safeParse(inlinesDocFromTipTap(doc)).success).toBe(true);
  });
});
