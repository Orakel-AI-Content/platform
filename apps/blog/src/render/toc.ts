// Sumário gerado dos intertítulos dos blocos de texto. O id de cada intertítulo vem do
// número estável do bloco e da posição dentro dele: não muda quando o texto muda.
import type { Block, Inline } from '@orakel/content-model/v1';

export type TocEntry = { id: string; level: 2 | 3; text: string };

export function headingId(blockN: number, index: number): string {
  return `secao-${blockN}-${index + 1}`;
}

export function inlineText(inlines: readonly Inline[]): string {
  return inlines
    .map((inline) =>
      inline.type === 'text' ? inline.text : inline.children.map((child) => child.text).join(''),
    )
    .join('');
}

export function tocEntries(blocks: readonly Block[]): TocEntry[] {
  return blocks.flatMap((block) => {
    if (block.type !== 'text') return [];
    let index = -1;
    return block.content.flatMap((node) => {
      if (node.type !== 'heading') return [];
      index += 1;
      return [
        { id: headingId(block.n, index), level: node.level, text: inlineText(node.children) },
      ];
    });
  });
}
