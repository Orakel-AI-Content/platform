import type { ReactNode } from 'react';

// Célula de duas linhas das listas (#361): a principal e a secundária, menor; nenhuma quebra
// além delas.

export function TwoLines({ children, secondary }: { children: ReactNode; secondary?: ReactNode }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span>{children}</span>
      {secondary !== undefined && <span className="text-xs">{secondary}</span>}
    </span>
  );
}
