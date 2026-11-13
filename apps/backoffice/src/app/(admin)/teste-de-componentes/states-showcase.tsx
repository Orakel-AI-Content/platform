'use client';

import { useState } from 'react';

import FileNotFound from '@/assets/svg/FileNotFound';
import { PageHeader } from '@/components/shared/PageHeader';
import { CONTENT_STATUS_LABEL, CONTENT_STATUS_TAG } from '@/components/shared/siteLabels.ts';
import { StatusScreen } from '@/components/shared/StatusScreen';
import type { TrailItem } from '@/components/shared/trail.ts';
import {
  type PublicationSite,
  SitePublicationSteps,
} from '@/components/sites/SitePublicationSteps';
import { StateTag } from '@/components/sites/SiteStatus';
import type { SiteActivity } from '@/domain/builds/builds.ts';
import { Button } from '@/components/ui/Button';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import { Card } from '@/components/ui/Card';

// Seções do cabeçalho de página e das peças de estado na vitrine (#388; workspace#62): o
// `PageHeader` com trilha e ação, o `StatusScreen` com ilustração e saída, o `StateTag` em cada
// cor e o painel de etapas da aba Publicação (#647) com e sem a ação. Dados fixos; os links apontam para âncoras da
// própria vitrine. Os títulos `h1` das peças não repetem o da página nem o nome de outra seção.

const TRAIL: TrailItem[] = [
  { label: 'Sites', href: '#vitrine-page-header' },
  { label: 'Portal Exemplo', href: '#vitrine-page-header' },
  { label: 'Mudanças pendentes' },
];

/** Os status de conteúdo cobrem as sete cores de `StateTagColor`, sem repetir nenhuma. */
const STATUSES = Object.keys(CONTENT_STATUS_TAG) as (keyof typeof CONTENT_STATUS_TAG)[];

/** O site da vitrine: no meio do ciclo, com release e sem versão no ar. */
const SITE: PublicationSite = {
  lifecycle: 'infra_aplicada',
  release: '1.4.0',
  activeVersionId: null,
  state: 'ativo',
  pausedReason: null,
  timeZone: 'America/Sao_Paulo',
};

const IDLE: SiteActivity = { open: null, openInfra: null, history: [] };

/** Publicação rodando: a etapa Build é a atual. */
const RUNNING: SiteActivity = {
  open: {
    id: 1,
    kind: 'build',
    status: 'rodando',
    currentStage: 'render',
    scheduledFor: null,
    startedAt: new Date('2026-10-20T13:00:00Z'),
    requestedBy: 'ana@orakel.local',
    cancelRequestedAt: null,
  },
  openInfra: null,
  history: [],
};

export function StatesShowcase() {
  const [lifecycle, setLifecycle] = useState<PublicationSite['lifecycle']>('infra_aplicada');
  return (
    <>
      <section aria-labelledby="vitrine-page-header" className="space-y-3">
        <h2 id="vitrine-page-header" className="text-lg font-semibold">
          PageHeader
        </h2>
        <Card>
          <div className="space-y-4">
            <PageHeader
              id="vitrine-page-header-titulo"
              trail={TRAIL}
              title="Mudanças pendentes"
              action={<ButtonLink href="#vitrine-page-header">Criar conteúdo</ButtonLink>}
            />
          </div>
        </Card>
      </section>

      <section aria-labelledby="vitrine-status-screen" className="space-y-3">
        <h2 id="vitrine-status-screen" className="text-lg font-semibold">
          StatusScreen
        </h2>
        <Card>
          <StatusScreen
            title="Página não encontrada"
            illustration={<FileNotFound height={280} width={280} />}
            action={<ButtonLink href="#vitrine-status-screen">Voltar para os sites</ButtonLink>}
          >
            O endereço não existe ou o item foi removido.
          </StatusScreen>
        </Card>
      </section>

      <section aria-labelledby="vitrine-state-tag" className="space-y-3">
        <h2 id="vitrine-state-tag" className="text-lg font-semibold">
          StateTag
        </h2>
        <ul className="flex flex-wrap items-center gap-3">
          {STATUSES.map((status) => (
            <li key={status}>
              <StateTag color={CONTENT_STATUS_TAG[status]}>{CONTENT_STATUS_LABEL[status]}</StateTag>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="vitrine-publication-steps" className="space-y-3">
        <h2 id="vitrine-publication-steps" className="text-lg font-semibold">
          SitePublicationSteps
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <SitePublicationSteps
              site={{ ...SITE, lifecycle }}
              instance={{ activePages: null, activeSince: null }}
              activity={IDLE}
              lifecycleAction={
                lifecycle === 'infra_aplicada' ? (
                  <Button size="sm" onClick={() => setLifecycle('zona_ativa')}>
                    Avançar etapa
                  </Button>
                ) : undefined
              }
            />
          </Card>
          <Card>
            <SitePublicationSteps
              site={{ ...SITE, lifecycle: 'publicado', activeVersionId: 'v41' }}
              instance={{
                activePages: 120,
                activeSince: { at: new Date('2026-10-20T12:00:00Z'), by: 'ana@orakel.local' },
              }}
              activity={RUNNING}
            />
          </Card>
        </div>
      </section>
    </>
  );
}
