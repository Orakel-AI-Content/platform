'use client';

import type { Inline, RichText } from '@orakel/content-model/v1';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';

import { Button } from '@/components/ui/button';

import {
  inlinesDocFromTipTap,
  inlinesDocToTipTap,
  richTextFromTipTap,
  richTextToTipTap,
  type TipTapNode,
} from './rich-text-convert.ts';
import { richTextExtensions, type RichTextMode } from './rich-text-extensions.ts';
import type { FieldProps, FieldRenderer } from './schema-form.tsx';

// Campo de rich text do gerador (TipTap). `richText`: parágrafo, intertítulo, lista;
// `inlines`: um parágrafo só (citação, FAQ, legenda). O valor é sempre a árvore do
// content-model, convertida a cada mudança; o HTML do editor nunca sai daqui.

const toDoc = (mode: RichTextMode, value: unknown): TipTapNode | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return mode === 'richText'
    ? richTextToTipTap(value as RichText)
    : inlinesDocToTipTap(value as Inline[]);
};

const fromDoc = (mode: RichTextMode, doc: TipTapNode) =>
  mode === 'richText' ? richTextFromTipTap(doc) : inlinesDocFromTipTap(doc);

type Action = {
  label: string;
  active: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
};

const MARK_ACTIONS: Action[] = [
  {
    label: 'Negrito',
    active: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: 'Itálico',
    active: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: 'Código',
    active: (e) => e.isActive('code'),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
  {
    label: 'Link',
    active: (e) => e.isActive('link'),
    run: (e) => {
      if (e.isActive('link')) {
        e.chain().focus().unsetLink().run();
        return;
      }
      const href = window.prompt('Endereço do link (caminho iniciado por / ou URL http/https)');
      if (href) e.chain().focus().setLink({ href }).run();
    },
  },
];

const BLOCK_ACTIONS: Action[] = [
  {
    label: 'Intertítulo 2',
    active: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Intertítulo 3',
    active: (e) => e.isActive('heading', { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: 'Lista',
    active: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: 'Lista numerada',
    active: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
];

function Toolbar({ editor, mode, label }: { editor: Editor; mode: RichTextMode; label: string }) {
  const actions = mode === 'richText' ? [...MARK_ACTIONS, ...BLOCK_ACTIONS] : MARK_ACTIONS;
  const pressed = useEditorState({
    editor,
    selector: ({ editor: current }) => actions.map((action) => action.active(current)),
  });
  return (
    <div role="toolbar" aria-label={`Formatação: ${label}`} className="flex flex-wrap gap-1">
      {actions.map((action, index) => (
        <Button
          key={action.label}
          variant={pressed[index] ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={pressed[index] ?? false}
          onClick={() => action.run(editor)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

export function RichTextEditor({
  mode,
  id,
  label,
  value,
  onChange,
  invalid,
  describedBy,
}: FieldProps & { mode: RichTextMode }) {
  const editor = useEditor({
    extensions: richTextExtensions(mode),
    content: toDoc(mode, value),
    // O Backoffice renderiza no servidor; o editor só existe no cliente.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': mode === 'richText' ? 'true' : 'false',
        'aria-label': label,
        'aria-invalid': invalid ? 'true' : 'false',
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        class:
          'min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm aria-invalid:border-destructive',
      },
    },
    onUpdate: ({ editor: current }) => onChange(fromDoc(mode, current.getJSON() as TipTapNode)),
  });
  if (!editor) return null;
  return (
    <div className="space-y-2">
      <Toolbar editor={editor} mode={mode} label={label} />
      <EditorContent editor={editor} />
    </div>
  );
}

function RichTextField(props: FieldProps) {
  return <RichTextEditor mode="richText" {...props} />;
}

function InlinesField(props: FieldProps) {
  return <RichTextEditor mode="inlines" {...props} />;
}

/**
 * Campo registrável no SchemaForm (`fields={{ content: richTextField('richText') }}`).
 * Devolve sempre o mesmo componente por modo: chamar no render não remonta o editor.
 */
export function richTextField(mode: RichTextMode): FieldRenderer {
  return mode === 'richText' ? RichTextField : InlinesField;
}
