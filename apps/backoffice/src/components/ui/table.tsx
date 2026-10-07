import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

// Tabela do shadcn/ui (new-york), copiada para o projeto como o CLI faria.

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-x-auto rounded-md border border-border">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return (
    <thead className={cn('bg-muted [&_tr]:border-b [&_tr]:border-border', className)} {...props} />
  );
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-border', className)} {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn('h-10 px-3 text-left align-middle font-medium whitespace-nowrap', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td
      className={cn('px-3 py-2 align-middle whitespace-nowrap tabular-nums', className)}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return <caption className={cn('mt-3 text-sm text-muted-foreground', className)} {...props} />;
}
