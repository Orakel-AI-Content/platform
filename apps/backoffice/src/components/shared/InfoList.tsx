import type { ReactNode } from 'react';

import classNames from '@/components/ui/utils/classNames';

// Lista de dados das telas de detalhe (#368): o `CustomerInfoField` do `ProfileSection` do Ecme
// (`views/concepts/customers/CustomerDetails`), com o rótulo em cima e o valor embaixo, em vez da
// grade `auto_1fr`, que estourava no celular com slug ou URL longa. O corpo é `text-sm`; o rótulo
// fica na cor do texto do body (com a substituição do docs/migration/ecme.md) e o valor, na dos
// títulos do template (o `.heading-text`: `text-gray-900`/`gray-100`, como no `PageHeader`). Sem
// estado próprio: serve a Server e a Client Components.

/**
 * O `<dl>` dos campos. As colunas ficam com quem usa (`className`): uma no diálogo de mídia, a
 * grade do `ProfileSection` (`sm:grid-cols-2 xl:grid-cols-1`) na lateral de uma tela de detalhe.
 */
export function InfoList({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={classNames('grid gap-4 text-sm', className)}>{children}</dl>;
}

/**
 * Um campo: `dt` e `dd` agrupados num `div` (válido dentro de `<dl>`). `min-w-0` deixa o item
 * da grade encolher, e `wrap-anywhere` quebra o valor sem espaço (slug, URL) em vez de rolar.
 */
export function InfoField({
  label,
  className,
  children,
}: {
  label: ReactNode;
  /** Classes extras do valor (`tabular-nums` num número). */
  className?: string;
  /** O valor: texto, ou um nó rico (Tag, link). */
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-semibold text-gray-600 dark:text-gray-400">{label}</dt>
      <dd
        className={classNames(
          'font-bold text-gray-900 wrap-anywhere dark:text-gray-100',
          className,
        )}
      >
        {children}
      </dd>
    </div>
  );
}
