import type { ReactNode } from 'react';

import { LifecycleSteps } from '@/components/sites/LifecycleSteps';
import { RedirectUsageAlert } from '@/components/sites/RedirectUsageAlert';
import {
  BuildWindowForm,
  DailyPublishLimitForm,
  LifecycleAction,
  LifecycleActionScope,
  RegisterG1Form,
} from '@/components/sites/SiteActions';
import { formatDateTime, formatDuration } from '@/components/shared/siteLabels.ts';
import { SiteBuildsTable } from '@/components/sites/SiteBuildsTable';
import { SiteOperations, SiteOperationsScope } from '@/components/sites/SiteOperations';
import { SiteSummaryCard } from '@/components/sites/SiteSummaryCard';
import { SiteTabs } from '@/components/sites/SiteTabs';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import Card from '@/components/ui/Card';
import { can } from '@/domain/access/rbac.ts';
import { listRollbackVersions } from '@/domain/builds/builds.ts';
import { listReleases } from '@/domain/releases/releases.ts';
import { listPolicyTriggers } from '@/domain/sites/policy-triggers.ts';
import { readSiteInstance, redirectUsageFor } from '@/domain/sites/sites.ts';
import { DetailLayout } from '@/components/shared/DetailLayout';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { PageHeader } from '@/components/shared/PageHeader';
import { SECTION_HINT_CLASS } from '@/components/shared/sectionText.ts';
import { siteTrail } from '@/components/shared/trail.ts';

import {
  advanceLifecycleAction,
  publishNow,
  rebuildOnReleaseAction,
  registerG1Action,
  resumeSiteAction,
  rollbackSiteAction,
  setBuildWindowAction,
  setDailyPublishLimitAction,
} from '../actions.ts';
import { sitePageContext } from './editorial-page.tsx';

export const dynamic = 'force-dynamic';

/**
 * Página do site na tela de detalhe do guia (#370), no layout do `CustomerDetails` do Ecme
 * (#595): no cabeçalho, "Editar configuração" (site.configure) e as ações de operação
 * (operations.run): "Publicar agora" ou, pausado, "Retomar", e o "Mais ações" com "Reconstruir
 * na release" e "Reverter", com o erro logo abaixo do cabeçalho. Embaixo, o resumo só com o
 * estado atual à esquerda e, à direita, o `Card` com as abas Ciclo de vida, Builds, G1, Janela
 * de agrupamento e Limite diário (#490; empilham abaixo de `xl`). Lê o site pelo
 * sitePageContext (a mesma busca do layout), os gatilhos e o uso de redirects, que vira um aviso
 * acima do resumo quando o core marca `alert` (#487); as ações do ciclo, do G1, da janela e do
 * limite só aparecem com site.configure, e o domínio confere de novo.
 */
export default async function SitePage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site } = context.value;
  const triggers = await listPolicyTriggers(db, actor, siteId);
  const g1 = triggers.ok ? triggers.value.find((record) => record.trigger === 'G1') : undefined;
  const redirects = await redirectUsageFor(db, actor, siteId);
  const instance = await readSiteInstance(db, actor, siteId);
  if (!instance.ok) return noRead;
  const canConfigure = can(actor, 'site.configure');
  const canOperate = can(actor, 'operations.run');
  // As releases do "Reconstruir" (#515): listá-las exige release.promote, que a operação e o
  // admin têm junto de operations.run; recusada a lista, a ação não aparece.
  const releases = canOperate ? await listReleases(db, actor) : undefined;
  // As versões do "Reverter" (#514): as dos builds `ok`, sem a que está no ar.
  const versions = canOperate ? await listRollbackVersions(db, actor, siteId) : undefined;

  // Dica e estado das abas de G1, janela e limite (o nome da aba é o título): com permissão, o corpo do
  // cartão do formulário (gerado do schema, botões no rodapé, #333); sem, um cartão só de leitura.
  const g1Intro = (
    <>
      <p className={SECTION_HINT_CLASS}>
        Registro que libera a indexação do site: sem ele, o site não pode ficar indexável.
      </p>
      {g1 ? (
        <p className="text-sm">
          Registrado por {g1.registeredBy} em {formatDateTime(g1.registeredAt, site.timeZone)}
          {g1.note ? ` — ${g1.note}` : ''}.
        </p>
      ) : (
        <p className="text-sm">G1 não registrado: o site não pode ficar indexável.</p>
      )}
    </>
  );
  const windowIntro = (
    <>
      <p className={SECTION_HINT_CLASS}>
        Tempo que as mudanças aguardam antes de virar um build: as que chegam nesse intervalo entram
        no mesmo build.
      </p>
      <p className="text-sm">
        Janela efetiva:{' '}
        <strong>
          {formatDuration(site.effectiveBuildWindowSeconds)},{' '}
          {site.buildWindowSeconds === null ? 'padrão' : 'própria'}
        </strong>
      </p>
    </>
  );

  const limitIntro = (
    <>
      <p className={SECTION_HINT_CLASS}>
        Quantas publicações o site aceita por dia, contadas no dia de São Paulo: a que passaria do
        limite é recusada.
      </p>
      <p className="text-sm">
        Limite efetivo:{' '}
        <strong>
          {site.effectiveDailyPublishLimit} por dia,{' '}
          {site.dailyPublishLimit === null ? 'padrão' : 'próprio'}
        </strong>
      </p>
      <p className="text-sm">
        Usadas hoje:{' '}
        <strong className="tabular-nums">
          {site.publishedToday} de {site.effectiveDailyPublishLimit}
        </strong>{' '}
        (feitas e agendadas para hoje); restam{' '}
        {Math.max(0, site.effectiveDailyPublishLimit - site.publishedToday)}. A contagem recomeça à
        meia-noite de São Paulo.
      </p>
    </>
  );

  const edit = canConfigure ? (
    <ButtonLink href={`/sites/${site.id}/configuracao`} variant="solid" size="sm">
      Editar configuração
    </ButtonLink>
  ) : undefined;
  const header = (action?: ReactNode) => (
    <PageHeader id="site-title" trail={siteTrail(site)} title={site.name} action={action} />
  );

  return (
    <section aria-labelledby="site-title" className="list-width space-y-4">
      {canOperate ? (
        <SiteOperationsScope>
          {header(
            <>
              {edit}
              <SiteOperations
                siteId={site.id}
                paused={site.state === 'pausado'}
                release={site.release}
                timeZone={site.timeZone}
                publish={publishNow}
                resume={resumeSiteAction}
                rebuild={
                  releases?.ok
                    ? {
                        releases: releases.value.map(({ tag, imageStatus }) => ({
                          tag,
                          imageStatus,
                        })),
                        action: rebuildOnReleaseAction.bind(null, site.id),
                      }
                    : undefined
                }
                rollback={
                  versions?.ok
                    ? { versions: versions.value, action: rollbackSiteAction.bind(null, site.id) }
                    : undefined
                }
              />
            </>,
          )}
        </SiteOperationsScope>
      ) : (
        header(edit)
      )}
      {redirects.ok && redirects.value.alert && <RedirectUsageAlert usage={redirects.value} />}
      <DetailLayout>
        <SiteSummaryCard site={site} instance={instance.value} g1Registered={g1 !== undefined} />
        <SiteTabs
          lifecycle={
            canConfigure ? (
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
            )
          }
          builds={<SiteBuildsTable builds={instance.value.recentBuilds} timeZone={site.timeZone} />}
          g1={
            !g1 && canConfigure ? (
              <RegisterG1Form intro={g1Intro} action={registerG1Action.bind(null, site.id)} />
            ) : (
              <Card bodyClass="space-y-3">{g1Intro}</Card>
            )
          }
          buildWindow={
            canConfigure ? (
              <BuildWindowForm
                intro={windowIntro}
                own={site.buildWindowSeconds}
                action={setBuildWindowAction.bind(null, site.id)}
              />
            ) : (
              <Card bodyClass="space-y-3">{windowIntro}</Card>
            )
          }
          dailyLimit={
            canConfigure ? (
              <DailyPublishLimitForm
                intro={limitIntro}
                own={site.dailyPublishLimit}
                action={setDailyPublishLimitAction.bind(null, site.id)}
              />
            ) : (
              <Card bodyClass="space-y-3">{limitIntro}</Card>
            )
          }
        />
      </DetailLayout>
    </section>
  );
}
