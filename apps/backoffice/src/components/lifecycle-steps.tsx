import type { ReactNode } from 'react';

import { LIFECYCLE_LABEL, LIFECYCLE_ORDER } from '@/components/site-labels.ts';
import { cn } from '@/lib/utils';
import type { SiteSummary } from '@/domain/sites/sites.ts';

type StepState = 'concluída' | 'atual' | 'pendente';

const MARKER_CLASS: Record<StepState, string> = {
  concluída: 'border-primary bg-primary text-primary-foreground',
  atual: 'border-primary bg-background text-foreground ring-2 ring-ring ring-offset-2',
  pendente: 'border-dashed border-muted-foreground bg-background text-muted-foreground',
};

const LABEL_CLASS: Record<StepState, string> = {
  concluída: 'text-foreground',
  atual: 'font-semibold text-foreground',
  pendente: 'text-muted-foreground',
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
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                MARKER_CLASS[state],
              )}
            >
              {index + 1}
            </span>
            <div className="space-y-2 pt-0.5">
              <p className={LABEL_CLASS[state]}>
                {LIFECYCLE_LABEL[step]}{' '}
                <span className="text-sm font-normal text-muted-foreground">({state})</span>
              </p>
              {index === currentIndex + 1 && action}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
