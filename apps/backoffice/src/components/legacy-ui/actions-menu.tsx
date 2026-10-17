'use client';

import { useId, type MouseEvent, type ReactNode } from 'react';

import { buttonVariants } from '@/components/legacy-ui/button';
import { IconButton } from '@/components/legacy-ui/icon-button';
import { cn } from '@/lib/utils';

// Menu "Mais ações" (#98): ações secundárias de uma linha atrás de um botão, sem Radix. A
// Popover API nativa abre, fecha (clique fora e Esc) e devolve o foco ao botão; o componente
// não tem estado. Acionar um item (clique, Enter ou Espaço) fecha a lista (#115): um item
// botão não desmonta o menu como um link que troca de página. Os itens são links e botões
// comuns, na ordem do Tab, sem role="menu" (que exigiria setas e foco gerenciado em
// JavaScript).

/** Fecha a lista quando o clique cai num link ou botão dela; o navegador devolve o foco. */
function closeOnItem(event: MouseEvent<HTMLDivElement>) {
  const list = event.currentTarget;
  const item = event.target instanceof Element ? event.target.closest('a, button') : null;
  if (item !== null && list.contains(item)) list.hidePopover();
}

export function ActionsMenu({
  label,
  trigger,
  text,
  align = 'end',
  children,
  className,
}: {
  /** Item da linha no nome acessível: "Mais ações: exemplo-a". */
  label?: string;
  /**
   * Gatilho em botão de ícone (#134), no lugar do "Mais ações": o `label` dele é o nome
   * acessível e a dica ("Inserir bloco na posição 2").
   */
  trigger?: { label: string; icon: ReactNode };
  /**
   * Botão com texto próprio no lugar de "Mais ações" (#172, seletor de site): `visible` é o
   * texto mostrado e `label` o nome acessível, que contém o texto visível (WCAG 2.5.3).
   */
  text?: { visible: string; label: string };
  /** Lado para onde a lista abre: `end` (padrão) cresce para a esquerda; `start`, para a direita. */
  align?: 'start' | 'end';
  /** Links e botões do menu, já com o estilo (ex.: `buttonVariants({ variant: 'ghost' })`). */
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  // useId gera um identificador válido em CSS (`_R_0_`): a âncora liga a lista ao botão.
  const anchor = `--actions-${id}`;
  return (
    <>
      {trigger ? (
        <IconButton
          label={trigger.label}
          icon={trigger.icon}
          popoverTarget={id}
          className={className}
          style={{ anchorName: anchor }}
        />
      ) : (
        <button
          type="button"
          popoverTarget={id}
          aria-label={text ? text.label : label ? `Mais ações: ${label}` : undefined}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), className)}
          style={{ anchorName: anchor }}
        >
          {text ? text.visible : 'Mais ações'}
        </button>
      )}
      {/* Sem anchor positioning, a lista fica no posicionamento padrão do popover (centro). Com
          ele, a altura máxima é a da área do position-area menos a margem (stretch; 100% passaria
          o mt-1), e a lista rola por dentro quando os itens não cabem (#221). Os itens não
          encolhem para caber: quem rola é a lista. */}
      <div
        id={id}
        popover="auto"
        style={{ positionAnchor: anchor }}
        onClick={closeOnItem}
        className={cn(
          'min-w-40 flex-col items-stretch gap-1 overflow-y-auto rounded-md border border-border bg-background p-1 text-foreground shadow-md open:flex *:shrink-0 supports-[position-anchor:--a]:inset-auto supports-[position-anchor:--a]:m-0 supports-[position-anchor:--a]:mt-1 supports-[position-anchor:--a]:max-h-[stretch] supports-[position-anchor:--a]:[position-try-fallbacks:flip-block]',
          align === 'start'
            ? 'supports-[position-anchor:--a]:[position-area:bottom_span-right]'
            : 'supports-[position-anchor:--a]:[position-area:bottom_span-left]',
        )}
      >
        {children}
      </div>
    </>
  );
}
