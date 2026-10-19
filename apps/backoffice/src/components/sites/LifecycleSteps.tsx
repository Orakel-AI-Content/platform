import type { ReactNode } from 'react';

import { LIFECYCLE_LABEL, LIFECYCLE_ORDER } from '@/components/shared/siteLabels.ts';
import classNames from '@/components/ui/utils/classNames';
import type { SiteSummary } from '@/domain/sites/sites.ts';

type StepState = 'concluída' | 'atual' | 'pendente';

// Tokens do Ecme no cartão, com os pares do globals-contrast.test.ts: o número da concluída
// como o texto do botão solid, o da atual como título no cartão e o da pendente como texto
// no cartão.
const MARKER_CLASS: Record<StepState, string> = {
  concluída: 'border-primary bg-primary text-neutral dark:text-gray-950',
  atual:
    'border-primary bg-white text-gray-900 outline-2 outline-offset-2 outline-primary dark:bg-gray-800 dark:text-gray-100',
  pendente:
    'border-dashed border-gray-400 bg-white text-gray-600 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const LABEL_CLASS: Record<StepState, string> = {
  concluída: 'text-gray-900 dark:text-gray-100',
  atual: 'font-semibold text-gray-900 dark:text-gray-100',
  pendente: 'text-gray-600 dark:text-gray-400',
};

/**
 * Ciclo de vida do site como sequência fixa (#148): cada etapa diz em texto se está concluída,
 * atual ou pendente, além do estilo; a atual leva `aria-current="step"`. A ação, quando a
 * página a passa, fica no item da etapa seguinte, a que ela conclui.
 */
export function LifecycleSteps({
  current,
  action,
}: {
  current: SiteSummary['lifecycle'];
  action?: ReactNode;
}) {
  const currentIndex = LIFECYCLE_ORDER.indexOf(current);
  return (
    <ol className="space-y-3">
      {LIFECYCLE_ORDER.map((step, index) => {
        const state: StepState =
          index < currentIndex ? 'concluída' : index === currentIndex ? 'atual' : 'pendente';
        return (
          <li
            key={step}
            aria-current={state === 'atual' ? 'step' : undefined}
            className="flex gap-3"
          >
            <span
              aria-hidden="true"
              className={classNames(
                'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                MARKER_CLASS[state],
              )}
            >
              {index + 1}
            </span>
            <div className="space-y-2 pt-0.5">
              <p className={LABEL_CLASS[state]}>
                {LIFECYCLE_LABEL[step]}{' '}
                <span className="text-sm font-normal text-gray-600 dark:text-gray-400">
                  ({state})
                </span>
              </p>
              {index === currentIndex + 1 && action}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
