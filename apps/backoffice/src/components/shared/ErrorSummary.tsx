'use client';

import Alert from '@/components/ui/Alert';

// Resumo de erros de um formulário no Alert do Ecme (`type="danger"`), como o `ActionAlert`:
// o Alert não tem papel de região viva, então o `role="alert"` fica num contêiner sempre
// montado, que recebe o Alert quando há erro.

/** Item do resumo: com `onFocus`, vira um botão que leva o foco ao campo. */
export type ErrorSummaryItem = { key: string; text: string; onFocus?: () => void };

export function ErrorSummary({
  lines,
  items = [],
  className,
}: {
  /** Erros sem campo (recusa do servidor sem `path`), acima da lista. */
  lines: readonly string[];
  /** Um item por campo inválido, sob "Corrija os campos destacados:". */
  items?: readonly ErrorSummaryItem[];
  className?: string;
}) {
  const empty = lines.length === 0 && items.length === 0;
  return (
    <div role="alert" className={className}>
      {!empty && (
        <Alert type="danger" showIcon duration={0}>
          <div className="space-y-1 text-sm">
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {items.length > 0 && (
              <>
                <p>Corrija os campos destacados:</p>
                <ul className="list-disc space-y-1 pl-5">
                  {items.map((item) => (
                    <li key={item.key}>
                      {item.onFocus ? (
                        <button
                          type="button"
                          className="text-left underline underline-offset-4"
                          onClick={item.onFocus}
                        >
                          {item.text}
                        </button>
                      ) : (
                        item.text
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Alert>
      )}
    </div>
  );
}
