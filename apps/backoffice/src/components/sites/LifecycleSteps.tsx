import type { ReactNode } from 'react';

import { INFRA_STEP_TEXT } from '@/components/shared/siteLabels.ts';
import type { SiteSummary } from '@/domain/sites/sites.ts';

/**
 * Conteúdo da etapa "Infra e zona" do painel da aba "Publicação" (#647; era o `Steps` das quatro
 * etapas do ciclo de vida, #148, #369): o ciclo de vida em texto visível e, quando a página a
 * passa, as ações manuais: a que leva ao passo seguinte ("Marcar infra aplicada", "Marcar zona
 * ativa") e "Desmarcar", que volta uma etapa com confirmação (#714). O erro das ações fica no
 * `ActionAlert` do `LifecycleActionScope`, abaixo do painel.
 */
export function LifecycleSteps({
  current,
  action,
}: {
  current: SiteSummary['lifecycle'];
  action?: ReactNode;
}) {
  return (
    <>
      <span className="block">{INFRA_STEP_TEXT[current]}</span>
      {action && <span className="mt-2 block">{action}</span>}
    </>
  );
}
