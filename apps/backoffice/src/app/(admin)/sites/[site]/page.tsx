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
import { SiteSummaryCard } from '@/components/sites/SiteSummaryCard';
import { SiteTabs } from '@/components/sites/SiteTabs';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import Card from '@/components/ui/Card';
import { can } from '@/domain/access/rbac.ts';
import { listPolicyTriggers } from '@/domain/sites/policy-triggers.ts';
import { redirectUsageFor } from '@/domain/sites/sites.ts';
import { DetailLayout } from '@/components/shared/DetailLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { SECTION_HINT_CLASS } from '@/components/shared/sectionText.ts';
import { siteTrail } from '@/components/shared/trail.ts';

import {
  advanceLifecycleAction,
  publishNow,
  registerG1Action,
  setBuildWindowAction,
  setDailyPublishLimitAction,
} from '../actions.ts';
import { sitePageContext } from './editorial-page.tsx';

export const dynamic = 'force-dynamic';

/**
 * Página do site na tela de detalhe do guia (#370): o resumo à esquerda (dados de publicação e
 * "Publicar agora", com operations.run) e, à direita, o `Card` com as abas Ciclo de vida, G1,
 * Janela de agrupamento e Limite diário (#490; empilham abaixo de `xl`). Lê o site pelo sitePageContext (a mesma
 * busca do layout), os gatilhos e o uso de redirects, que vira um aviso acima do resumo quando
 * o core marca `alert` (#487); as ações do ciclo, do G1, da janela e do limite e "Editar
 * configuração" só aparecem com site.configure, e o domínio confere de novo.
 */
export default async function SitePage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site } = context.value;
  const triggers = await listPolicyTriggers(db, actor, siteId);
  const g1 = triggers.ok ? triggers.value.find((record) => record.trigger === 'G1') : undefined;
  const redirects = await redirectUsageFor(db, actor, siteId);
  const canConfigure = can(actor, 'site.configure');
  const canPublish = can(actor, 'operations.run') && site.state !== 'pausado';

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
    </>
  );

  return (
    <section aria-labelledby="site-title" className="list-width space-y-4">
      <PageHeader
        id="site-title"
        trail={siteTrail(site)}
        title={site.name}
        action={
          canConfigure ? (
            <ButtonLink href={`/sites/${site.id}/configuracao`} variant="solid" size="sm">
              Editar configuração
            </ButtonLink>
          ) : undefined
        }
      />
      {redirects.ok && redirects.value.alert && <RedirectUsageAlert usage={redirects.value} />}
      <DetailLayout>
        <SiteSummaryCard
          site={site}
          g1Registered={g1 !== undefined}
          publish={canPublish ? publishNow : undefined}
        />
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
