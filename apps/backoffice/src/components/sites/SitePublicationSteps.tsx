import type { ReactNode } from 'react';

import {
  PUBLICATION_STEPS,
  PUBLICATION_STEP_LABEL,
  SITE_STATE_LABEL,
  liveResultText,
  liveStatusText,
  liveVersionText,
  releaseAvailableText,
  releaseInUseText,
  type PublicationStep,
} from '@/components/shared/siteLabels.ts';
import type { StepStatus } from '@/components/ui/@types/common';
import { Steps } from '@/components/ui/Steps';
import { Tag } from '@/components/ui/Tag';
import type { ExecutionHistoryItem, SiteActivity } from '@/domain/builds/builds.ts';
import type { SiteInstance, SiteSummary } from '@/domain/sites/sites.ts';

import { LifecycleSteps } from './LifecycleSteps.tsx';

export type PublicationSite = Pick<
  SiteSummary,
  'lifecycle' | 'release' | 'activeVersionId' | 'state' | 'pausedReason' | 'timeZone'
> & {
  /**
   * A release `disponivel` mais recente, só quando difere da do site (#690): a página a resolve e
   * decide; o painel só a mostra numa `Tag` na etapa Versão. Ausente ou `null`, nenhuma Tag.
   */
  newerRelease?: string | null;
};

export type PublicationInstance = Pick<SiteInstance, 'activePages' | 'activeSince'>;

/**
 * A ação de cada etapa, abaixo do estado (#648); a de Infra e zona vem em `lifecycleAction`.
 * `cancel` (#649) entra na Build enquanto há publicação na fila ou em andamento.
 */
export type PublicationStepActions = Partial<
  Record<Exclude<PublicationStep, 'infra'>, ReactNode>
> & { cancel?: ReactNode };

/**
 * As ações da Build (#649). Na fila, "Publicar agora" (que pula a janela) e "Cancelar"; em
 * andamento, só "Cancelar"; sem publicação aberta (ou com reversão), só "Publicar agora". Duas
 * posições fixas: a primeira é "Cancelar" em andamento e "Publicar agora" no resto, então, quando
 * o build em andamento fecha, o React troca só o texto do botão e o foco fica nele; a segunda é o
 * "Cancelar" da fila.
 */
function buildActions(actions: PublicationStepActions, activity: SiteActivity): ReactNode {
  const open = activity.open?.kind === 'build' ? activity.open.status : null;
  const cancel = actions.cancel;
  const first = open === 'rodando' && cancel !== undefined ? cancel : actions.build;
  const second = open === 'na_fila' ? cancel : undefined;
  if (first === undefined && second === undefined) return undefined;
  return (
    <span className="flex flex-wrap gap-2">
      {first}
      {second}
    </span>
  );
}

function stepAction(
  step: Exclude<PublicationStep, 'infra'>,
  actions: PublicationStepActions,
  activity: SiteActivity,
): ReactNode {
  return step === 'build' ? buildActions(actions, activity) : actions[step];
}

type Step = { status: StepStatus; text: ReactNode };

/** O último build terminado, no histórico (do mais recente ao mais antigo). */
function lastBuild(activity: SiteActivity): ExecutionHistoryItem | undefined {
  return activity.history.find(
    (item): item is ExecutionHistoryItem => item.type === 'execucao' && item.kind === 'build',
  );
}

const BUILD_RESULT_STATUS: Record<ExecutionHistoryItem['status'], StepStatus> = {
  ok: 'complete',
  failed: 'error',
  cancelado: 'pending',
};

function steps(
  site: PublicationSite,
  instance: PublicationInstance,
  activity: SiteActivity,
  lifecycleAction: ReactNode,
): Record<PublicationStep, Step> {
  const last = lastBuild(activity);
  const infraDone = site.lifecycle === 'zona_ativa' || site.lifecycle === 'publicado';
  return {
    infra: {
      status: infraDone ? 'complete' : 'in-progress',
      text: <LifecycleSteps current={site.lifecycle} action={lifecycleAction} />,
    },
    versao: {
      status: site.release === null ? 'pending' : 'complete',
      text: (
        <span className="flex flex-wrap items-center gap-2">
          <span>{releaseInUseText(site.release)}</span>
          {site.newerRelease ? (
            <>
              <span aria-hidden="true">·</span>
              <Tag>{releaseAvailableText(site.newerRelease)}</Tag>
            </>
          ) : null}
        </span>
      ),
    },
    build:
      activity.open !== null
        ? { status: 'in-progress', text: liveStatusText(activity.open, site.timeZone) }
        : last !== undefined
          ? { status: BUILD_RESULT_STATUS[last.status], text: liveResultText(last, site.timeZone) }
          : { status: 'pending', text: 'Nenhum build ainda' },
    no_ar:
      site.activeVersionId === null
        ? { status: 'pending', text: 'Nenhuma versão no ar' }
        : {
            status: 'complete',
            text: liveVersionText(
              site.activeVersionId,
              instance.activePages,
              instance.activeSince,
              site.timeZone,
            ),
          },
    site: {
      status:
        site.state === 'pausado' ? 'error' : site.state === 'ativo' ? 'complete' : 'in-progress',
      text:
        site.state === 'pausado' && site.pausedReason
          ? `${SITE_STATE_LABEL.pausado}: ${site.pausedReason}`
          : SITE_STATE_LABEL[site.state],
    },
  };
}

/**
 * Onde o `aria-current` fica: na etapa Build enquanto há execução aberta; senão, na primeira
 * etapa não concluída; tudo concluído, em nenhuma (-1).
 */
function currentIndex(byStep: Record<PublicationStep, Step>, open: boolean): number {
  if (open) return PUBLICATION_STEPS.indexOf('build');
  return PUBLICATION_STEPS.findIndex((step) => byStep[step].status !== 'complete');
}

/**
 * Painel de etapas da aba "Publicação" (#647): Infra e zona, Versão, Build, No ar e Site, em
 * sequência no `Steps` vertical do Ecme. Cada etapa tem o `status` próprio (são independentes,
 * não um avanço único) e o estado em texto visível na `description`; o `StepItem` diz o estado
 * genérico ("concluída", "atual", "pendente", "com erro") em `sr-only`, sem repetir o texto.
 * A etapa Build segue a atividade que a aba relê durante uma execução (`SiteLiveActivity`):
 * "na fila" com o horário previsto, em andamento com a etapa ou o resultado do último build.
 * As ações de operação (#648) vêm prontas em `actions`, uma por etapa, abaixo do estado, como o
 * "Marcar…" de Infra e zona; o painel só as posiciona. Com publicação na fila, a Build mostra
 * `cancel` ao lado da sua; em andamento, no lugar dela (#649).
 */
export function SitePublicationSteps({
  site,
  instance,
  activity,
  lifecycleAction,
  actions = {},
}: {
  site: PublicationSite;
  instance: PublicationInstance;
  activity: SiteActivity;
  lifecycleAction?: ReactNode;
  actions?: PublicationStepActions;
}) {
  const byStep = steps(site, instance, activity, lifecycleAction);
  return (
    <Steps
      vertical
      aria-label="Etapas da publicação"
      current={currentIndex(byStep, activity.open !== null)}
    >
      {PUBLICATION_STEPS.map((step) => {
        const action = step === 'infra' ? undefined : stepAction(step, actions, activity);
        return (
          <Steps.Item
            key={step}
            status={byStep[step].status}
            title={PUBLICATION_STEP_LABEL[step]}
            description={
              <span className="block text-sm">
                <span className="block">{byStep[step].text}</span>
                {action && <span className="mt-2 block">{action}</span>}
              </span>
            }
          />
        );
      })}
    </Steps>
  );
}
