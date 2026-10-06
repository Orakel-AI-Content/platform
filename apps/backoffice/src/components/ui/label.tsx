import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

// Label do shadcn/ui (new-york), com <label> nativo no lugar do Radix.
export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm leading-none font-medium', className)} {...props} />;
}
