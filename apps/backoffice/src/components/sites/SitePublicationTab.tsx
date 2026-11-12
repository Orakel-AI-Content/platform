'use client';

import type { ReactNode } from 'react';

import type { SiteActivity } from '@/domain/builds/builds.ts';

import { LifecycleActionScope } from './SiteActions.tsx';
import { type SiteActivityStatus, SiteLiveActivity } from './SiteLiveActivity.tsx';
import {
  type PublicationInstance,
  type PublicationSite,
  SitePublicationSteps,
} from './SitePublicationSteps.tsx';

/**
 * Aba "Publicação" da página do site (#647; junta as antigas "Ciclo de vida" e "Histórico"): em
 * cima, o painel de etapas; embaixo, a faixa ao vivo e o histórico. Os dois leem a mesma
 * atividade, relida pelo polling do `SiteLiveActivity` durante uma execução, e a etapa Build
 * muda sem recarregar a página. A ação do ciclo de vida ("Marcar…"), quando a página a passa,
 * vai na etapa Infra e zona, com o erro no `ActionAlert` do `LifecycleActionScope`, logo abaixo
 * do painel.
 */
export function SitePublicationTab({
  site,
  instance,
  activity,
  status,
  lifecycleAction,
  pollMs,
}: {
  site: PublicationSite;
  instance: PublicationInstance;
  activity: SiteActivity;
  status: SiteActivityStatus;
  lifecycleAction?: ReactNode;
  pollMs?: number;
}) {
  return (
    <SiteLiveActivity
      activity={activity}
      status={status}
      timeZone={site.timeZone}
      pollMs={pollMs}
      panel={(current) => (
        <LifecycleActionScope>
          <SitePublicationSteps
            site={site}
            instance={instance}
            activity={current}
            lifecycleAction={lifecycleAction}
          />
        </LifecycleActionScope>
      )}
    />
  );
}
