import { LifecycleSteps } from '@/components/lifecycle-steps';
import {
  BuildWindowForm,
  LifecycleAction,
  LifecycleActionScope,
  RegisterG1Form,
} from '@/components/site-actions';
import {
  formatDateTime,
  formatDuration,
  SITE_STATE_LABEL,
  SITE_STATE_VARIANT,
} from '@/components/site-labels.ts';
import {
  LastBuildSummary,
  PendingCount,
  PublishNowPanel,
  StateTag,
} from '@/components/site-status';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import Card from '@/components/ui/Card';
import { can } from '@/domain/access/rbac.ts';
import { listPolicyTriggers } from '@/domain/sites/policy-triggers.ts';

import {
  advanceLifecycleAction,
  publishNow,
  registerG1Action,
  setBuildWindowAction,
} from '../actions.ts';
import { PageHeader, sitePageContext, siteTrail } from './editorial-page.tsx';

export const dynamic = 'force-dynamic';

/**
 * Página do site: ciclo de vida, publicação, registro do G1 e janela de agrupamento. Lê o site
 * pelo sitePageContext (a mesma busca do layout) e os gatilhos; as ações só aparecem com
 * site.configure ("Publicar agora", com operations.run) e o domínio confere de novo.
 */
export default async function SitePage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site } = context.value;
  const triggers = await listPolicyTriggers(db, actor, siteId);
  const g1 = triggers.ok ? triggers.value.find((record) => record.trigger === 'G1') : undefined;
  const canConfigure = can(actor, 'site.configure');
  const canPublish = can(actor, 'operations.run') && site.state !== 'pausado';

  // Cada seção é uma região com o h2 no corpo do Card, como as do SchemaForm.
  const titleClass = 'text-lg font-semibold text-gray-900 dark:text-gray-100';
  const hintClass = 'text-sm text-gray-600 dark:text-gray-400';
  return (
    <section aria-labelledby="site-title" className="form-width space-y-6">
      <PageHeader
        id="site-title"
        trail={siteTrail(site)}
        title={site.name}
        action={
          canConfigure ? (
            <ButtonLink href={`/sites/${site.id}/configuracao`} size="sm">
              Editar configuração
            </ButtonLink>
          ) : undefined
        }
      />
      <p className={hintClass}>
        {site.domain} · Indexável: {site.indexavel ? 'sim' : 'não'}
      </p>

      <section aria-labelledby="lifecycle-title">
        <Card bodyClass="space-y-3">
          <h2 id="lifecycle-title" className={titleClass}>
            Ciclo de vida
          </h2>
          {canConfigure ? (
            <LifecycleActionScope>
              <LifecycleSteps
                current={site.lifecycle}
                action={
                  <LifecycleAction
                    lifecycle={site.lifecycle}
                    action={advanceLifecycleAction.bind(null, site.id)}
                  />
                }
              />
            </LifecycleActionScope>
          ) : (
            <LifecycleSteps current={site.lifecycle} />
          )}
        </Card>
      </section>

      <section aria-labelledby="publication-title">
        <Card bodyClass="space-y-3">
          <h2 id="publication-title" className={titleClass}>
            Publicação
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-gray-600 dark:text-gray-400">Estado</dt>
            <dd className="space-y-1">
              <StateTag color={SITE_STATE_VARIANT[site.state]}>
                {SITE_STATE_LABEL[site.state]}
              </StateTag>
              {site.state === 'pausado' && site.pausedReason && (
                <p className="text-sm">{site.pausedReason}</p>
              )}
            </dd>
            <dt className="text-gray-600 dark:text-gray-400">Release</dt>
            <dd>{site.release ?? 'Sem release'}</dd>
            <dt className="text-gray-600 dark:text-gray-400">Mudanças pendentes</dt>
            <dd>
              <PendingCount siteId={site.id} count={site.pendingChanges} />
            </dd>
            <dt className="text-gray-600 dark:text-gray-400">Último build</dt>
            <dd>
              <LastBuildSummary build={site.lastBuild} timeZone={site.timeZone} />
            </dd>
          </dl>
          {canPublish && <PublishNowPanel siteId={site.id} action={publishNow} />}
        </Card>
      </section>

      <section aria-labelledby="g1-title">
        <Card bodyClass="space-y-3">
          <h2 id="g1-title" className={titleClass}>
            G1 (indexação)
          </h2>
          <p className={hintClass}>
            Registro que libera a indexação do site: sem ele, o site não pode ficar indexável.
          </p>
          {g1 ? (
            <p>
              Registrado por {g1.registeredBy} em {formatDateTime(g1.registeredAt, site.timeZone)}
              {g1.note ? ` — ${g1.note}` : ''}.
            </p>
          ) : (
            <>
              <p>G1 não registrado: o site não pode ficar indexável.</p>
              {canConfigure && <RegisterG1Form action={registerG1Action.bind(null, site.id)} />}
            </>
          )}
        </Card>
      </section>

      <section aria-labelledby="window-title">
        <Card bodyClass="space-y-3">
          <h2 id="window-title" className={titleClass}>
            Janela de agrupamento
          </h2>
          <p className={hintClass}>
            Tempo que as mudanças aguardam antes de virar um build: as que chegam nesse intervalo
            entram no mesmo build.
          </p>
          <p>
            Janela efetiva:{' '}
            <strong>
              {formatDuration(site.effectiveBuildWindowSeconds)},{' '}
              {site.buildWindowSeconds === null ? 'padrão' : 'própria'}
            </strong>
          </p>
          {canConfigure && (
            <BuildWindowForm
              own={site.buildWindowSeconds}
              action={setBuildWindowAction.bind(null, site.id)}
            />
          )}
        </Card>
      </section>
    </section>
  );
}
