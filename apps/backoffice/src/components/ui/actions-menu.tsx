import { useId, type ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Menu "Mais ações" (#98): ações secundárias de uma linha atrás de um botão, sem Radix. A
// Popover API nativa abre, fecha (clique fora e Esc) e devolve o foco ao botão; o componente
// não tem estado e serve a Server e Client Components. Os itens são links e botões comuns,
// na ordem do Tab, sem role="menu" (que exigiria setas e foco gerenciado em JavaScript).

export function ActionsMenu({
  label,
  children,
  className,
}: {
  /** Item da linha no nome acessível: "Mais ações: exemplo-a". */
  label?: string;
  /** Links e botões do menu, já com o estilo (ex.: `buttonVariants({ variant: 'ghost' })`). */
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  // useId gera um identificador válido em CSS (`_R_0_`): a âncora liga a lista ao botão.
  const anchor = `--actions-${id}`;
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={label ? `Mais ações: ${label}` : undefined}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), className)}
        style={{ anchorName: anchor }}
      >
        Mais ações
      </button>
      {/* Sem anchor positioning, a lista fica no posicionamento padrão do popover (centro). */}
      <div
        id={id}
        popover="auto"
        style={{ positionAnchor: anchor }}
        className="min-w-40 flex-col items-stretch gap-1 rounded-md border border-border bg-background p-1 text-foreground shadow-md open:flex supports-[position-anchor:--a]:inset-auto supports-[position-anchor:--a]:m-0 supports-[position-anchor:--a]:mt-1 supports-[position-anchor:--a]:[position-area:bottom_span-left] supports-[position-anchor:--a]:[position-try-fallbacks:flip-block]"
      >
        {children}
      </div>
    </>
  );
}
