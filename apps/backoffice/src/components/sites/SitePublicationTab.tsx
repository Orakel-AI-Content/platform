'use client';

import type { ReactNode } from 'react';

import type { SiteActivity } from '@/domain/builds/builds.ts';

import { LifecycleActionScope } from './SiteActions.tsx';
import { type SiteActivityStatus, SiteLiveActivity } from './SiteLiveActivity.tsx';
import { SiteOperationsAlert } from './SiteOperations.tsx';
import {
  type PublicationInstance,
  type PublicationSite,
  type PublicationStepActions,
  SitePublicationSteps,
} from './SitePublicationSteps.tsx';

/**
 * Aba "Publicação" da página do site (#647; junta as antigas "Ciclo de vida" e "Histórico"): em
 * cima, o painel de etapas; embaixo, a faixa ao vivo e o histórico. Os dois leem a mesma
 * atividade, relida pelo polling do `SiteLiveActivity` durante uma execução, e a etapa Build
 * muda sem recarregar a página. A ação do ciclo de vida ("Marcar…"), quando a página a passa,
 * vai na etapa Infra e zona, com o erro no `ActionAlert` do `LifecycleActionScope`, logo abaixo
 * do painel. As ações de operação (`actions`, #648) vão cada uma na sua etapa; a recusa delas
 * aparece no `SiteOperationsAlert`, também abaixo do painel (sem `SiteOperationsScope`, nada).
 */
export function SitePublicationTab({
  site,
  instance,
  activity,
  status,
  lifecycleAction,
  actions,
  pollMs,
}: {
  site: PublicationSite;
  instance: PublicationInstance;
  activity: SiteActivity;
  status: SiteActivityStatus;
  lifecycleAction?: ReactNode;
  actions?: PublicationStepActions;
  pollMs?: number;
}) {
  return (
    <SiteLiveActivity
      activity={activity}
      status={status}
      timeZone={site.timeZone}
      pollMs={pollMs}
      panel={(current) => (
        <>
          <LifecycleActionScope>
            <SitePublicationSteps
              site={site}
              instance={instance}
              activity={current}
              lifecycleAction={lifecycleAction}
              actions={actions}
            />
          </LifecycleActionScope>
          <SiteOperationsAlert />
        </>
      )}
    />
  );
}
