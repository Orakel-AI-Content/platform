'use client';

import type { Inline, RichText } from '@orakel/content-model/v1';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { Bold, Code, Heading2, Heading3, Italic, Link, List, ListOrdered } from 'lucide-react';
import type { ReactNode } from 'react';

import { IconButton } from '@/components/legacy-ui/icon-button';

import { LinkPopover } from './link-popover.tsx';

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
  icon: ReactNode;
  active: (editor: Editor) => boolean;
  /** Sem `run`: a ação abre o popover de link (#132). */
  run?: (editor: Editor) => void;
};

const MARK_ACTIONS: Action[] = [
  {
    label: 'Negrito',
    icon: <Bold />,
    active: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: 'Itálico',
    icon: <Italic />,
    active: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: 'Código',
    icon: <Code />,
    active: (e) => e.isActive('code'),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
  {
    label: 'Link',
    icon: <Link />,
    active: (e) => e.isActive('link'),
  },
];

const BLOCK_ACTIONS: Action[] = [
  {
    label: 'Intertítulo 2',
    icon: <Heading2 />,
    active: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Intertítulo 3',
    icon: <Heading3 />,
    active: (e) => e.isActive('heading', { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: 'Lista',
    icon: <List />,
    active: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: 'Lista numerada',
    icon: <ListOrdered />,
    active: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
];

/**
 * Barra de formatação (#133): botões de ícone com dica, em dois grupos — marcas e, no
 * `richText`, estrutura — separados por um `role="separator"` dentro da mesma `toolbar`.
 * O botão ativo tem `aria-pressed`, e o visual vem do mesmo atributo.
 */
function Toolbar({ editor, mode, label }: { editor: Editor; mode: RichTextMode; label: string }) {
  const groups = mode === 'richText' ? [MARK_ACTIONS, BLOCK_ACTIONS] : [MARK_ACTIONS];
  const actions = groups.flat();
  const pressed = useEditorState({
    editor,
    selector: ({ editor: current }) => actions.map((action) => action.active(current)),
  });
  return (
    <div role="toolbar" aria-label={`Formatação: ${label}`} className="flex items-center gap-1">
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="contents">
          {groupIndex > 0 && (
            <div role="separator" aria-orientation="vertical" className="mx-1 h-5 w-px bg-border" />
          )}
          {group.map((action) => {
            const index = actions.indexOf(action);
            const { run } = action;
            if (!run) {
              return (
                <LinkPopover key={action.label} editor={editor} pressed={pressed[index] ?? false} />
              );
            }
            return (
              <IconButton
                key={action.label}
                label={action.label}
                icon={action.icon}
                aria-pressed={pressed[index] ?? false}
                className="aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                onClick={() => run(editor)}
              />
            );
          })}
        </div>
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
