import type { ComponentProps, ReactNode } from 'react';

import { buttonVariants } from '@/components/legacy-ui/button';
import { cn } from '@/lib/utils';

// Botão só de ícone com dica (#131), sem Radix: o nome acessível vem do `aria-label`, e a
// dica visível repete o texto num `span` `aria-hidden`, mostrado no hover e no foco por
// teclado (`focus-visible`) só com CSS — o leitor de tela lê o nome uma vez. O ícone também
// fica fora da árvore de acessibilidade.

export function IconButton({
  label,
  icon,
  className,
  type = 'button',
  ...props
}: Omit<ComponentProps<'button'>, 'children' | 'aria-label'> & {
  /** Nome acessível e texto da dica ("Mover bloco 3 para cima"). */
  label: string;
  /** Ícone do `lucide-react` (ou outro SVG), desenhado em 16 px. */
  icon: ReactNode;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'icon' }),
        'group relative',
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="[&_svg]:size-4">
        {icon}
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs font-normal whitespace-nowrap text-background group-hover:block group-focus-visible:block"
      >
        {label}
      </span>
    </button>
  );
}
