import { currentActor } from '@/auth/request-actor.ts';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { InfraBatchProgress } from '@/components/sites/InfraBatchCard';
import { ReapplyOutdatedButton } from '@/components/sites/ReapplyOutdatedDialog';
import { SitesTable } from '@/components/sites/SitesTable';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import { getDb } from '@/db/client.ts';
import { can } from '@/domain/access/rbac.ts';
import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { ListHeader } from '@/components/shared/PageHeader';

import { TbPlus } from 'react-icons/tb';

import {
  confirmInfraBatchAction,
  infraBatchAction,
  publishNow,
  refreshSitesAction,
  requestInfraBatchAction,
} from './actions.ts';
import { readInfraBatchView, showsReapplyOutdated } from './infra-batch.ts';
import { readVisibleSites } from '../visible-sites.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sites' };

type SearchParams = { searchParams: Promise<{ cadastrado?: string | string[] }> };

/**
 * Registro de instâncias: um site por linha, com estado, release e mudanças pendentes.
 * `?cadastrado=<id>` vem do cadastro: a tabela anuncia a confirmação no topo. Lista no padrão
 * do template (#364): título, ações, toolbar e tabela no cartão; sem trilha, por ser a raiz.
 * Com `site.configure`, o lote "Reaplicar nos desatualizados" (workspace#98): o botão no
 * cabeçalho e o cartão do último lote entre ele e a tabela, como o `RolloutCard` em Releases.
 */
export default async function SitesPage({ searchParams }: SearchParams) {
  const { cadastrado } = await searchParams;
  const actor = await currentActor();
  if (!actor.ok) return null;
  const sites = await readVisibleSites();
  if (!sites?.ok) {
    return noRead;
  }
  const canConfigure = can(actor.value, 'site.configure');
  const batch = canConfigure ? await readInfraBatchView(getDb().db, actor.value) : null;
  const names = Object.fromEntries(sites.value.map((site) => [site.id, site.name]));
  const register = canConfigure ? (
    <ButtonLink
      href="/sites/novo"
      variant="solid"
      icon={<TbPlus className="text-xl" aria-hidden />}
    >
      Criar site
    </ButtonLink>
  ) : undefined;
  const reapply = showsReapplyOutdated(actor.value, sites.value, batch) && (
    <ReapplyOutdatedButton
      actions={{
        request: requestInfraBatchAction,
        read: infraBatchAction,
        confirm: confirmInfraBatchAction,
      }}
      names={names}
    />
  );
  return (
    <section aria-labelledby="sites-title" className="list-width space-y-4">
      <AdaptiveCard>
        <div className="flex flex-col gap-4">
          <ListHeader
            id="sites-title"
            title="Sites"
            action={
              register && (
                <>
                  {reapply}
                  {register}
                </>
              )
            }
          />
          {batch !== null && (
            <InfraBatchProgress
              key={`${batch.id}-${batch.state}`}
              initial={batch}
              read={infraBatchAction}
              refresh={refreshSitesAction}
              names={names}
            />
          )}
          <SitesTable
            rows={sites.value}
            publishNow={can(actor.value, 'operations.run') ? publishNow : undefined}
            canConfigure={canConfigure}
            emptyAction={register}
            created={typeof cadastrado === 'string' ? cadastrado : undefined}
            labelledBy="sites-title"
          />
        </div>
      </AdaptiveCard>
    </section>
  );
}
