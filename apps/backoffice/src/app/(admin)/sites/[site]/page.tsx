import { RedirectUsageAlert } from '@/components/sites/RedirectUsageAlert';
import { SiteContentMetrics } from '@/components/sites/SiteContentMetrics';
import {
  BuildWindowForm,
  DailyPublishLimitForm,
  LifecycleAction,
  RegisterG1Form,
} from '@/components/sites/SiteActions';
import {
  formatDateTime,
  formatDuration,
  latestInfraCreation,
  latestInfraRun,
} from '@/components/shared/siteLabels.ts';
import { SiteOperationButton, SiteOperationsScope } from '@/components/sites/SiteOperations';
import { SitePublicationTab } from '@/components/sites/SitePublicationTab';
import { SiteSummaryCard } from '@/components/sites/SiteSummaryCard';
import { SiteTabs } from '@/components/sites/SiteTabs';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import Card from '@/components/ui/Card';
import { can } from '@/domain/access/rbac.ts';
import { listRollbackVersions, previousVersion, siteActivity } from '@/domain/builds/builds.ts';
import { countContentsByStatus } from '@/domain/content/contents.ts';
import { previousRelease } from '@/domain/builds/site-state.ts';
import { latestAvailableRelease, listReleases } from '@/domain/releases/releases.ts';
import { listPolicyTriggers } from '@/domain/sites/policy-triggers.ts';
import { readSiteInfraCheck, readSiteInstance, redirectUsageFor } from '@/domain/sites/sites.ts';
import { DetailLayout } from '@/components/shared/DetailLayout';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { PageHeader } from '@/components/shared/PageHeader';
import { SECTION_HINT_CLASS } from '@/components/shared/sectionText.ts';
import { siteTrail } from '@/components/shared/trail.ts';

import {
  cancelBuildAction,
  checkSiteInfraAction,
  confirmInfraPlanAction,
  confirmInfraReapplyAction,
  confirmInfraRemovalAction,
  infraPlanAction,
  pauseSiteAction,
  publishNow,
  rebuildOnReleaseAction,
  registerG1Action,
  requestInfraPlanAction,
  requestInfraReapplyAction,
  requestInfraRemovalAction,
  resumeSiteAction,
  retreatLifecycleAction,
  revertReleaseAction,
  rollbackSiteAction,
  setBuildWindowAction,
  setDailyPublishLimitAction,
  siteActivityAction,
  siteInfraCheckAction,
  undoLastPublishAction,
} from '../actions.ts';
import { sitePageContext } from './editorial-page.tsx';

export const dynamic = 'force-dynamic';

/**
 * Página do site na tela de detalhe do guia (#370), no layout do `CustomerDetails` do Ecme
 * (#595): no cabeçalho, só "Editar configuração" (site.configure). Embaixo, o resumo só com o
 * estado atual à esquerda e, à direita, o `Card` com as abas Publicação (o painel de etapas e,
 * embaixo, a atividade do site com o status ao vivo, para todos os perfis, #637, #638, #647), G1,
 * Janela de agrupamento e Limite diário (#490; empilham abaixo de `xl`). As ações de operação
 * (operations.run, #648) ficam nas etapas do painel: "Atualizar para a mais recente" (#690, só com
 * release disponível mais recente que a do site, mostrada a todos numa Tag), "Voltar à versão
 * anterior (X)" (#691, só com anterior disponível) e "Escolher outra versão do motor" (só as
 * releases `disponivel`) na Versão,
 * "Publicar agora" na Build (com "Cancelar" ao lado na fila e no lugar dele em andamento,
 * #649), "Desfazer última publicação" (com versão anterior, #649) e "Escolher outra versão" na No
 * ar e, na linha Site, "Pausar" com motivo (#650) ou, pausado, "Retomar", com a recusa logo
 * abaixo do painel. Lê o site pelo
 * sitePageContext (a mesma busca do layout), os gatilhos e o uso de redirects, que vira um aviso
 * acima do resumo quando o core marca `alert` (#487); as ações do ciclo, do G1, da janela e do
 * limite só aparecem com site.configure, e o domínio confere de novo; com ele, a etapa Infra e
 * zona oferece "Criar infraestrutura" ou "Revisar e confirmar" pela execução aberta (#825).
 */
export default async function SitePage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  const triggers = await listPolicyTriggers(db, actor, siteId);
  const g1 = triggers.ok ? triggers.value.find((record) => record.trigger === 'G1') : undefined;
  const redirects = await redirectUsageFor(db, actor, siteId);
  const instance = await readSiteInstance(db, actor, siteId);
  if (!instance.ok) return noRead;
  const contentCounts = await countContentsByStatus(db, actor, siteId);
  if (!contentCounts.ok) return noRead;
  const activity = await siteActivity(db, actor, siteId);
  if (!activity.ok) return noRead;
  const infraCheck = await readSiteInfraCheck(db, actor, siteId);
  if (!infraCheck.ok) return noRead;
  const canConfigure = can(actor, 'site.configure');
  const canOperate = can(actor, 'operations.run');
  const canDestroy = can(actor, 'site.destroy');
  // As releases do "Escolher outra versão do motor" (#515): listá-las exige release.promote, que a
  // operação e o admin têm junto de operations.run; recusada a lista, a ação não aparece. Só as
  // `disponivel` entram no diálogo (#691); o domínio recusa as outras.
  const releases = canOperate ? await listReleases(db, actor) : undefined;
  // As versões do "Reverter" (#514): as dos builds `ok`, sem a que está no ar.
  const versions = canOperate ? await listRollbackVersions(db, actor, siteId) : undefined;
  // O destino do "Desfazer última publicação" (#649): só mostrado; sem ele, a ação não aparece.
  const previous = canOperate ? await previousVersion(db, actor, siteId) : undefined;
  // O destino do "Voltar à versão anterior" (#691): só mostrado; nulo (sem troca, anterior nula ou
  // fora de `disponivel`), a ação não aparece.
  const previousTag = canOperate ? await previousRelease(db, actor, siteId) : undefined;
  // A release `disponivel` mais recente (#690), só quando difere da do site: a mesma condição dá a
  // Tag "disponível" na etapa Versão (para todos) e o "Atualizar para a mais recente".
  const latest = await latestAvailableRelease(db);
  const newerRelease = latest !== null && latest !== site.release ? latest : null;

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
  const publication = (
    <SitePublicationTab
      site={{
        lifecycle: site.lifecycle,
        release: site.release,
        newerRelease,
        activeVersionId: site.activeVersionId,
        state: site.state,
        pausedReason: site.pausedReason,
        timeZone: site.timeZone,
        infraDriftStatus: site.infraDrift.status,
      }}
      instance={{
        activePages: instance.value.activePages,
        activeSince: instance.value.activeSince,
      }}
      activity={activity.value}
      status={siteActivityAction.bind(null, site.id)}
      infraCheck={{ check: infraCheck.value, now: new Date() }}
      infraCheckStatus={siteInfraCheckAction.bind(null, site.id)}
      lifecycleAction={
        canConfigure ? (
          <LifecycleAction
            lifecycle={site.lifecycle}
            check={checkSiteInfraAction.bind(null, site.id)}
            undo={retreatLifecycleAction.bind(null, site.id)}
            infra={{
              open: activity.value.openInfra && {
                id: activity.value.openInfra.id,
                status: activity.value.openInfra.status,
              },
              retry: latestInfraCreation(activity.value.history)?.status === 'falhou',
              request: requestInfraPlanAction.bind(null, site.id),
              read: infraPlanAction.bind(null, site.id),
              confirm: confirmInfraPlanAction.bind(null, site.id),
            }}
            remove={
              canDestroy
                ? {
                    domain: site.domain,
                    activePages: instance.value.activePages,
                    active: site.state !== 'pausado',
                    open: activity.value.openInfra && {
                      id: activity.value.openInfra.id,
                      status: activity.value.openInfra.status,
                      kind: activity.value.openInfra.kind,
                    },
                    request: requestInfraRemovalAction.bind(null, site.id),
                    read: infraPlanAction.bind(null, site.id),
                    confirm: confirmInfraRemovalAction.bind(null, site.id),
                  }
                : undefined
            }
            reapply={{
              open: activity.value.openInfra && {
                id: activity.value.openInfra.id,
                status: activity.value.openInfra.status,
                kind: activity.value.openInfra.kind,
                inBatch: activity.value.openInfra.inBatch,
              },
              retry: latestInfraRun(activity.value.history, 'reaplicar')?.status === 'falhou',
              request: requestInfraReapplyAction.bind(null, site.id),
              read: infraPlanAction.bind(null, site.id),
              confirm: confirmInfraReapplyAction.bind(null, site.id),
            }}
          />
        ) : undefined
      }
      actions={
        canOperate
          ? {
              versao: (
                <span className="flex flex-wrap gap-2">
                  <SiteOperationButton operation="update" />
                  <SiteOperationButton operation="revert" />
                  <SiteOperationButton operation="rebuild" />
                </span>
              ),
              build: <SiteOperationButton operation="publish" />,
              cancel: <SiteOperationButton operation="cancel" />,
              no_ar: (
                <span className="flex flex-wrap gap-2">
                  <SiteOperationButton operation="undo" />
                  <SiteOperationButton operation="rollback" />
                </span>
              ),
              // Um ou outro: "Pausar" com o site ativo, "Retomar" com ele pausado.
              site: (
                <>
                  <SiteOperationButton operation="pause" />
                  <SiteOperationButton operation="resume" />
                </>
              ),
            }
          : undefined
      }
    />
  );

  return (
    <section aria-labelledby="site-title" className="list-width space-y-4">
      <PageHeader id="site-title" trail={siteTrail(site)} title={site.name} action={edit} />
      {redirects.ok && redirects.value.alert && <RedirectUsageAlert usage={redirects.value} />}
      <DetailLayout>
        <SiteSummaryCard site={site} instance={instance.value} g1Registered={g1 !== undefined} />
        {/* Os cartões de conteúdo (#596) ficam na coluna da direita, acima das abas: em cima de
            tudo, empurravam o resumo para fora da primeira tela a 1440 × 900 (#595). */}
        <div className="flex w-full min-w-0 flex-col gap-4">
          <SiteContentMetrics
            siteId={site.id}
            counts={contentCounts.value}
            publishedToday={site.publishedToday}
            dailyLimit={site.effectiveDailyPublishLimit}
            canWrite={canWrite}
          />
          <SiteTabs
            publication={
              canOperate ? (
                <SiteOperationsScope
                  siteId={site.id}
                  paused={site.state === 'pausado'}
                  release={site.release}
                  timeZone={site.timeZone}
                  publish={publishNow}
                  pause={pauseSiteAction.bind(null, site.id)}
                  resume={resumeSiteAction}
                  rebuild={
                    releases?.ok
                      ? {
                          releases: releases.value
                            .filter(({ pipelineState }) => pipelineState === 'disponivel')
                            .map(({ tag }) => ({ tag })),
                          action: rebuildOnReleaseAction.bind(null, site.id),
                        }
                      : undefined
                  }
                  rollback={
                    versions?.ok
                      ? { versions: versions.value, action: rollbackSiteAction.bind(null, site.id) }
                      : undefined
                  }
                  cancel={cancelBuildAction}
                  undo={
                    previous?.ok && previous.value !== null
                      ? { version: previous.value, action: undoLastPublishAction }
                      : undefined
                  }
                  update={
                    newerRelease !== null
                      ? { tag: newerRelease, action: rebuildOnReleaseAction.bind(null, site.id) }
                      : undefined
                  }
                  revert={
                    previousTag?.ok && previousTag.value !== null
                      ? { tag: previousTag.value, action: revertReleaseAction }
                      : undefined
                  }
                >
                  {publication}
                </SiteOperationsScope>
              ) : (
                publication
              )
            }
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
        </div>
      </DetailLayout>
    </section>
  );
}
