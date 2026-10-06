import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

// Input do shadcn/ui (new-york); aria-invalid destaca o campo com erro.
export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex min-h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive read-only:bg-muted',
        className,
      )}
      {...props}
    />
  );
}
