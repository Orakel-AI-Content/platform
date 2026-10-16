import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

// Button do shadcn/ui (new-york), sem Slot (Radix): para link com cara de botão, use
// buttonVariants() no <a>/<Link>. `aria-disabled` (indisponível mas focável, para o foco não
// se perder) tem o mesmo visual de `disabled` (#131).
export const buttonVariants = cva(
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-border bg-background hover:bg-muted',
        ghost: 'hover:bg-muted',
      },
      size: {
        default: '',
        sm: 'min-h-8 px-3 py-1 text-xs',
        // Botão só de ícone: 32 px, acima do alvo mínimo de 24 px (WCAG 2.5.8).
        icon: 'size-8 min-h-8 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
