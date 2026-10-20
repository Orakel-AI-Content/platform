import type { ReactNode } from 'react';

import { LIFECYCLE_LABEL, LIFECYCLE_ORDER } from '@/components/shared/siteLabels.ts';
import { Steps } from '@/components/ui/Steps';
import type { SiteSummary } from '@/domain/sites/sites.ts';

/**
 * Ciclo de vida do site como sequência fixa (#148) no `Steps` vertical do Ecme (#369): o `Steps`
 * desenha marcador e conector, marca a atual com `aria-current="step"` e diz o estado em
 * `sr-only`. A atual e as pendentes repetem o estado em texto visível, `aria-hidden` para o
 * leitor de tela não ouvi-lo duas vezes; sem ele, só a cor da borda as distinguiria. A ação,
 * quando a página a passa, fica na `description` da etapa seguinte, a que ela conclui.
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
    <Steps vertical current={currentIndex}>
      {LIFECYCLE_ORDER.map((step, index) => (
        <Steps.Item
          key={step}
          title={
            <>
              {LIFECYCLE_LABEL[step]}
              {index >= currentIndex && (
                <span
                  aria-hidden="true"
                  className="text-sm font-normal text-gray-600 dark:text-gray-400"
                >
                  {` (${index === currentIndex ? 'atual' : 'pendente'})`}
                </span>
              )}
            </>
          }
          description={
            index === currentIndex + 1 && action ? (
              <span className="mt-2 block">{action}</span>
            ) : undefined
          }
        />
      ))}
    </Steps>
  );
}
