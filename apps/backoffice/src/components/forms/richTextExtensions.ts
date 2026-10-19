import { HrefSchema } from '@orakel/content-model/v1';
import type { AnyExtension } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Code from '@tiptap/extension-code';
import Document from '@tiptap/extension-document';
import Heading from '@tiptap/extension-heading';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { UndoRedo } from '@tiptap/extensions';

// Extensões do editor: só o que o RichTextSchema do content-model aceita. Colar HTML passa
// pelo schema do ProseMirror montado daqui, então o resto (tabela, imagem, h1, estilo) cai.

export type RichTextMode = 'richText' | 'inlines';

const marks = [
  Bold,
  Italic,
  Code,
  Link.configure({
    openOnClick: false,
    autolink: false,
    isAllowedUri: (url) => HrefSchema.safeParse(url).success,
  }),
];

export function richTextExtensions(mode: RichTextMode): AnyExtension[] {
  if (mode === 'inlines') {
    // Um parágrafo só: citação, resposta de FAQ, legenda.
    return [Document.extend({ content: 'paragraph' }), Paragraph, Text, ...marks, UndoRedo];
  }
  return [
    Document,
    Paragraph,
    Text,
    Heading.configure({ levels: [2, 3] }),
    BulletList,
    OrderedList,
    // Item com um parágrafo só: o RichTextSchema não tem lista dentro de lista.
    ListItem.extend({ content: 'paragraph' }),
    ...marks,
    UndoRedo,
  ];
}
