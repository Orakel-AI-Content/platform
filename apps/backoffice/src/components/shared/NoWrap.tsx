import type { ReactNode } from 'react';

// Texto que não quebra numa célula (#585): datas ("10/11/2026, 14:56 BRT") numa linha só.

export function NoWrap({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>;
}
