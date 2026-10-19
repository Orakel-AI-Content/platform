'use client';

import { HrefSchema } from '@orakel/content-model/v1';
import type { Editor } from '@tiptap/react';
import { useEffect, useId, useRef, useState } from 'react';
import { PiLink } from 'react-icons/pi';

import { IconButton } from '@/components/shared/IconButton';
import { Button } from '@/components/ui/Button';
import { FormItem } from '@/components/ui/Form';
import { Input } from '@/components/ui/Input';

// Link do rich text (#132), no lugar do `window.prompt`: um popover nativo ancorado ao botão
// Link da barra (Popover API + anchor positioning). O endereço é validado com o `HrefSchema`,
// a mesma regra do `isAllowedUri` da extensão. Sem `<form>`: o campo de rich text já está
// dentro do formulário do editor, então o Enter é tratado aqui.
// No Ecme (#275): `Button`, `Input` e `FormItem` do `ui/`, superfície do `Dropdown`
// (`dropdown-menu`) e o botão ativo como o `ToolButton` do `shared/RichTextEditor`. O erro
// fica no fluxo, depois da dica: a mensagem do `FormItem` (`form-explain`) é absoluta, sob o
// campo, e cobriria a dica.

/**
 * Botão ativo da barra (`aria-pressed`), como o `active` do `ToolButton` do Ecme. No escuro, o
 * `text-primary` fica em 2,91:1 sobre o gray-700 do editor; o `primary-mild` chega a 3:1.
 */
export const PRESSED_CLASS = 'aria-pressed:text-primary dark:aria-pressed:text-primary-mild';

export function LinkPopover({ editor, pressed }: { editor: Editor; pressed: boolean }) {
  const id = useId();
  const popoverId = `${id}-link`;
  const anchor = `--link-${id}`;
  const hintId = `${id}-link-hint`;
  const errorId = `${id}-link-error`;
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [href, setHref] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [hasLink, setHasLink] = useState(false);

  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'open') {
        // Abre com o endereço do link onde está o cursor (ou vazio).
        const current: unknown = editor.getAttributes('link').href;
        setHref(typeof current === 'string' ? current : '');
        setHasLink(editor.isActive('link'));
        setError(undefined);
        requestAnimationFrame(() => inputRef.current?.focus());
      } else {
        // Esc ou clique fora devolvem o foco ao botão; o critério é voltar ao editor.
        editor.commands.focus();
      }
    };
    popover.addEventListener('toggle', onToggle);
    return () => popover.removeEventListener('toggle', onToggle);
  }, [editor]);

  const close = () => popoverRef.current?.hidePopover();

  const apply = () => {
    const value = href.trim();
    const parsed = HrefSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Endereço inválido');
      return;
    }
    if (editor.state.selection.empty && !editor.isActive('link')) {
      // Sem seleção, o próprio endereço vira o texto do link.
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: value,
          marks: [{ type: 'link', attrs: { href: value } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
    }
    close();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    close();
  };

  return (
    <>
      <IconButton
        label="Link"
        icon={<PiLink />}
        aria-pressed={pressed}
        popoverTarget={popoverId}
        className={PRESSED_CLASS}
        style={{ anchorName: anchor }}
      />
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        style={{ positionAnchor: anchor }}
        className="w-80 rounded-2xl border border-gray-100 bg-white p-3 text-gray-600 shadow-[0px_48px_64px_-16px_rgba(0,0,0,0.25)] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 supports-[position-anchor:--a]:inset-auto supports-[position-anchor:--a]:m-0 supports-[position-anchor:--a]:mt-1 supports-[position-anchor:--a]:[position-area:bottom_span-right] supports-[position-anchor:--a]:[position-try-fallbacks:flip-block]"
      >
        <FormItem htmlFor={`${id}-href`} label="Endereço do link" className="mb-3">
          <Input
            ref={inputRef}
            id={`${id}-href`}
            size="sm"
            value={href}
            invalid={error !== undefined}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            onChange={(event) => {
              setHref(event.target.value);
              setError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              // Sem isso, o Enter enviaria o formulário do editor.
              event.preventDefault();
              apply();
            }}
          />
          <p id={hintId} className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Caminho iniciado por / ou URL http(s).
          </p>
          {error && (
            <p id={errorId} className="mt-1 text-sm font-semibold text-error">
              {error}
            </p>
          )}
        </FormItem>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="solid" size="sm" onClick={apply}>
            Aplicar
          </Button>
          {hasLink && (
            <Button type="button" size="sm" onClick={remove}>
              Remover link
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
