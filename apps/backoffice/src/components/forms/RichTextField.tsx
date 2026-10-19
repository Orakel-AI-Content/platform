'use client';

import type { Inline, RichText } from '@orakel/content-model/v1';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import {
  PiCode,
  PiLink,
  PiListBullets,
  PiListNumbers,
  PiTextB,
  PiTextHThree,
  PiTextHTwo,
  PiTextItalic,
} from 'react-icons/pi';

import { IconButton } from '@/components/shared/IconButton';
import classNames from '@/components/ui/utils/classNames';

import { LinkPopover, PRESSED_CLASS } from './LinkPopover.tsx';

import {
  inlinesDocFromTipTap,
  inlinesDocToTipTap,
  richTextFromTipTap,
  richTextToTipTap,
  type TipTapNode,
} from './richTextConvert.ts';
import { richTextExtensions, type RichTextMode } from './richTextExtensions.ts';
import type { FieldProps, FieldRenderer } from './SchemaForm.tsx';

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

// Contêiner do `shared/RichTextEditor` do Ecme (v1.3.10, e5f9a1d), sobre o editor e a barra
// daqui (#275). O conteúdo não usa o `prose` do Ecme: o plugin de tipografia traz a própria
// paleta, fora do `@theme`. Texto como o do campo (o `dark:prose-p:text-gray-400` do Ecme fica
// em 4,11:1 sobre o gray-700), intertítulos como os títulos, links sublinhados na cor do texto
// (como no `prose`). O foco fica no contorno global de 2px na cor `ring`, sem o
// `focus:outline-hidden` do Ecme. Pares em `ECME_PAIRS` do globals-contrast.test.ts.
const CONTENT_CLASS = [
  'm-2 min-h-20 text-sm text-gray-800 dark:text-gray-100',
  '[&_p+p]:mt-2 [&_a]:underline [&_code]:font-mono',
  '[&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900 dark:[&_h2]:text-gray-100',
  '[&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-900 dark:[&_h3]:text-gray-100',
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_li]:my-1',
].join(' ');

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
    icon: <PiTextB />,
    active: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: 'Itálico',
    icon: <PiTextItalic />,
    active: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: 'Código',
    icon: <PiCode />,
    active: (e) => e.isActive('code'),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
  {
    label: 'Link',
    icon: <PiLink />,
    active: (e) => e.isActive('link'),
  },
];

const BLOCK_ACTIONS: Action[] = [
  {
    label: 'Intertítulo 2',
    icon: <PiTextHTwo />,
    active: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Intertítulo 3',
    icon: <PiTextHThree />,
    active: (e) => e.isActive('heading', { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: 'Lista',
    icon: <PiListBullets />,
    active: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: 'Lista numerada',
    icon: <PiListNumbers />,
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
    <div
      role="toolbar"
      aria-label={`Formatação: ${label}`}
      className="flex items-center gap-1 px-2 text-gray-900 dark:text-gray-100"
    >
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="contents">
          {groupIndex > 0 && (
            <div
              role="separator"
              aria-orientation="vertical"
              className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-600"
            />
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
                className={PRESSED_CLASS}
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
        class: CONTENT_CLASS,
      },
    },
    onUpdate: ({ editor: current }) => onChange(fromDoc(mode, current.getJSON() as TipTapNode)),
  });
  // No Tiptap 3 o editor não re-renderiza a cada transação; assina só o foco (como no Ecme).
  const focused = useEditorState({
    editor,
    selector: ({ editor: current }) => Boolean(current?.isFocused),
  });
  if (!editor) return null;
  return (
    <div
      className={classNames(
        'rich-text-editor rounded-xl ring-1 ring-gray-200 dark:ring-gray-600 border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 pt-3',
        focused && 'ring-primary border-primary',
        invalid && 'bg-error-subtle',
        focused && invalid && 'bg-error-subtle ring-error border-error',
      )}
    >
      <Toolbar editor={editor} mode={mode} label={label} />
      <EditorContent editor={editor} className="max-h-[600px] overflow-auto px-2" />
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
