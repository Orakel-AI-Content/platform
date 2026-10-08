'use client';

import { HrefSchema } from '@orakel/content-model/v1';
import type { Editor } from '@tiptap/react';
import { Link } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Link do rich text (#132), no lugar do `window.prompt`: um popover nativo ancorado ao botão
// Link da barra, como o `ActionsMenu` (Popover API + anchor positioning). O endereço é
// validado com o `HrefSchema`, a mesma regra do `isAllowedUri` da extensão. Sem `<form>`: o
// campo de rich text já está dentro do formulário do editor, então o Enter é tratado aqui.

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
        icon={<Link />}
        aria-pressed={pressed}
        popoverTarget={popoverId}
        className="aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        style={{ anchorName: anchor }}
      />
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        style={{ positionAnchor: anchor }}
        className="w-80 space-y-2 rounded-md border border-border bg-background p-3 text-foreground shadow-md supports-[position-anchor:--a]:inset-auto supports-[position-anchor:--a]:m-0 supports-[position-anchor:--a]:mt-1 supports-[position-anchor:--a]:[position-area:bottom_span-right] supports-[position-anchor:--a]:[position-try-fallbacks:flip-block]"
      >
        <Label htmlFor={`${id}-href`}>Endereço do link</Label>
        <Input
          ref={inputRef}
          id={`${id}-href`}
          value={href}
          aria-invalid={error !== undefined}
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
        <p id={hintId} className="text-xs text-muted-foreground">
          Caminho iniciado por / ou URL http(s).
        </p>
        {error && (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={apply}>
            Aplicar
          </Button>
          {hasLink && (
            <Button variant="outline" size="sm" onClick={remove}>
              Remover link
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
