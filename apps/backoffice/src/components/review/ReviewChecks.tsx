import { useId, type ReactNode } from 'react';
import { HiClock, HiMinusCircle } from 'react-icons/hi';

import { SECTION_HINT_CLASS, SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import Card from '@/components/ui/Card';
import StatusIcon from '@/components/ui/StatusIcon';
import type { TypeAttributes } from '@/components/ui/@types/common';

import type { ReviewCheckItem, ReviewCheckItemState } from './reviewCheckItems.ts';

// Checagens automáticas da revisão (workspace#87): o que o sistema já verificou, ao lado da
// prévia, para o revisor marcar só o que depende de julgamento. Separado do `ReviewPanel` para o
// wizard da #90 reaproveitar. Cada item mostra o estado no `StatusIcon` do Ecme (o ícone é
// decorativo; o estado vai em texto) e nunca tem caixa de seleção: quem marca é o sistema. Cada
// pendência diz onde está (bloco ou campo). Sem `'use client'`: serve a Server Components.

const STATE: Record<
  ReviewCheckItemState,
  { text: string; type: TypeAttributes.Status; custom?: ReactNode }
> = {
  ok: { text: 'OK', type: 'success' },
  aviso: { text: 'Aviso', type: 'warning' },
  erro: { text: 'Erro', type: 'danger' },
  verificando: { text: 'Verificando', type: 'info', custom: <HiClock /> },
  nao_verificado: { text: 'Não verificado', type: 'info', custom: <HiMinusCircle /> },
};

export function ReviewChecks({ items }: { items: readonly ReviewCheckItem[] }) {
  const id = useId();
  return (
    <Card>
      <section aria-labelledby={`${id}-title`} className="space-y-3">
        <h2 id={`${id}-title`} className={SECTION_TITLE_CLASS}>
          Checagens automáticas
        </h2>
        <p className={SECTION_HINT_CLASS}>
          Verificadas pelo sistema ao abrir a revisão. Só erro impede aprovar; aviso não.
        </p>
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {items.map((item) => {
            const state = STATE[item.state];
            return (
              <li key={item.key} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-start gap-2 text-sm">
                  <StatusIcon type={state.type} custom={state.custom} />
                  <span className="flex-1 pt-1 font-semibold text-gray-900 dark:text-gray-100">
                    {item.label}
                  </span>
                  <span className="pt-1">{state.text}</span>
                </div>
                {item.findings.length > 0 && (
                  <ul className="mt-1 list-disc space-y-1 pl-12 text-sm">
                    {item.findings.map((finding) => (
                      <li key={`${finding.where}:${finding.message}`}>
                        {finding.where !== '' && (
                          <span className="font-semibold">{finding.where}: </span>
                        )}
                        {finding.message}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </Card>
  );
}
