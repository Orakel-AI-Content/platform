import { useId, type ReactNode } from 'react';

// Tela de estado do Backoffice (#77): não encontrado, erro e sem permissão mudam só o
// conteúdo. Sem estado próprio: serve a Server e a Client Components. Sem tela equivalente no
// Ecme (#283): título na cor de heading do template e corpo na substituta AA do body.

export function StatusScreen({
  title,
  children,
  action,
}: {
  title: string;
  /** Uma frase do que aconteceu e, se houver, o que fazer. */
  children: ReactNode;
  /** Saída da tela: link de volta ou "Tentar de novo". */
  action?: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className="max-w-xl space-y-3">
      <h1 id={`${id}-title`} className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {title}
      </h1>
      <div className="text-gray-600 dark:text-gray-400">{children}</div>
      {action && <div className="flex flex-wrap gap-2 pt-1">{action}</div>}
    </section>
  );
}
