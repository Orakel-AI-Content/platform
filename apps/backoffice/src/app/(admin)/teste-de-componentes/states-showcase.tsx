'use client';

import { useState } from 'react';

import FileNotFound from '@/assets/svg/FileNotFound';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_TAG,
  LIFECYCLE_ORDER,
} from '@/components/shared/siteLabels.ts';
import { StatusScreen } from '@/components/shared/StatusScreen';
import type { TrailItem } from '@/components/shared/trail.ts';
import { LifecycleSteps } from '@/components/sites/LifecycleSteps';
import { StateTag } from '@/components/sites/SiteStatus';
import { Button } from '@/components/ui/Button';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import { Card } from '@/components/ui/Card';

// Seções do cabeçalho de página e das peças de estado na vitrine (#388; workspace#62): o
// `PageHeader` com trilha e ação, o `StatusScreen` com ilustração e saída, o `StateTag` em cada
// cor e o `LifecycleSteps` com e sem a ação. Dados fixos; os links apontam para âncoras da
// própria vitrine. Os títulos `h1` das peças não repetem o da página nem o nome de outra seção.

const TRAIL: TrailItem[] = [
  { label: 'Sites', href: '#vitrine-page-header' },
  { label: 'Portal Exemplo', href: '#vitrine-page-header' },
  { label: 'Mudanças pendentes' },
];

/** Os status de conteúdo cobrem as seis cores de `StateTagColor`, sem repetir nenhuma. */
const STATUSES = Object.keys(CONTENT_STATUS_TAG) as (keyof typeof CONTENT_STATUS_TAG)[];

export function StatesShowcase() {
  const [lifecycle, setLifecycle] = useState(1);
  const current = LIFECYCLE_ORDER[lifecycle] ?? 'publicado';
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

      <section aria-labelledby="vitrine-lifecycle-steps" className="space-y-3">
        <h2 id="vitrine-lifecycle-steps" className="text-lg font-semibold">
          LifecycleSteps
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <LifecycleSteps
              current={current}
              action={
                current === 'publicado' ? undefined : (
                  <Button size="sm" onClick={() => setLifecycle((step) => step + 1)}>
                    Avançar etapa
                  </Button>
                )
              }
            />
          </Card>
          <Card>
            <LifecycleSteps current="publicado" />
          </Card>
        </div>
      </section>
    </>
  );
}
