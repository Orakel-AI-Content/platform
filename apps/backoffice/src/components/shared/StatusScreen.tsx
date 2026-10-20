import { useId, type ReactNode } from 'react';

// Tela de estado do Backoffice (#77): não encontrado, erro e sem permissão mudam só o
// conteúdo. Sem estado próprio: serve a Server e a Client Components. Tela vazia do Ecme
// (#379): o `AccessDenied` e o "No user found" do `CustomerEdit`, centrados, com a ilustração
// por cima; título na cor de heading do template e corpo em `text-sm` na substituta AA do body.

export function StatusScreen({
  title,
  illustration,
  children,
  action,
}: {
  title: string;
  /** Ilustração decorativa (`aria-hidden`) de `src/assets/svg/`, em 280 × 280. */
  illustration: ReactNode;
  /** Uma frase do que aconteceu e, se houver, o que fazer. */
  children: ReactNode;
  /** Saída da tela: link de volta ou "Tentar de novo". */
  action?: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex h-full flex-col items-center justify-center text-center"
    >
      {illustration}
      <h1
        id={`${id}-title`}
        className="mt-10 mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100"
      >
        {title}
      </h1>
      <div className="text-sm text-gray-600 dark:text-gray-400">{children}</div>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </section>
  );
}
