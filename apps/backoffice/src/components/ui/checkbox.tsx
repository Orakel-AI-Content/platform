import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

// Checkbox do shadcn/ui (new-york) com <input type="checkbox"> nativo no lugar do Radix:
// teclado e leitores de tela sem dependência nova. Alvo de 24×24 px (WCAG 2.5.8) pelo rótulo.
export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 shrink-0 rounded border border-border accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
