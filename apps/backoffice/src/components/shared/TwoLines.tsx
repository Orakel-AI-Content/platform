import type { ReactNode } from 'react';

// Célula de duas linhas das listas (#361): a principal e a secundária, menor; nenhuma quebra
// além delas. Cada linha vai no máximo até a largura da célula, para o `Truncated` cortar nela
// (#585).

export function TwoLines({ children, secondary }: { children: ReactNode; secondary?: ReactNode }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="max-w-full">{children}</span>
      {secondary !== undefined && <span className="max-w-full text-xs">{secondary}</span>}
    </span>
  );
}
