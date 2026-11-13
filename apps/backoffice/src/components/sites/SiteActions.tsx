'use client';

import { createContext, use, useId, useRef, useState, type ReactNode } from 'react';

import { SchemaForm } from '@/components/forms/SchemaForm';
import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog, { dangerButtonClass } from '@/components/shared/ConfirmDialog.tsx';
import { INFRA_REMOVAL_PAUSE_FIRST, INFRA_STEP_TEXT } from '@/components/shared/siteLabels.ts';
import { Button } from '@/components/ui/Button';
import type { OpenInfraRun } from '@/domain/infra/runs.ts';
import type { InfraPlanView } from '@/domain/infra/plan.ts';
import type { SiteSummary } from '@/domain/sites/sites.ts';

import { CreateInfraDialog, useCreateInfra } from './CreateInfraDialog.tsx';
import { INFRA_REAPPLY_ALREADY_CONFIRMED, ReapplyInfraDialog } from './ReapplyInfraDialog.tsx';
import { INFRA_REMOVAL_ALREADY_CONFIRMED, RemoveInfraDialog } from './RemoveInfraDialog.tsx';

import { useInfraCheckContext } from './LifecycleSteps.tsx';

import type { SiteFormResult } from './siteConfigFormValues.ts';
import {
  BuildWindowSchema,
  DailyPublishLimitSchema,
  RegisterG1Schema,
  type BuildWindowValue,
  type DailyPublishLimitValue,
  type RegisterG1Value,
} from './siteOperationForms.ts';

// Ações da página do site, no padrão do "Publicar agora": a Server Action delega ao domínio,
// o sucesso vai para o toast e o erro para o Alert junto da ação. G1 e janela são formulários
// gerados do schema, em cartão com os botões no rodapé (#333), como o limite diário (#490). A
// página só as mostra com site.configure.

/** Etapas que "Desmarcar" volta (as que a conferência automática marca). */
type Step = 'infra_aplicada' | 'zona_ativa';

/** Etapa que "Desmarcar" volta, com a anterior que o site passa a ter. */
const UNDO_STEP = {
  infra_aplicada: { label: 'infra aplicada', back: 'cadastrado' },
  zona_ativa: { label: 'zona ativa', back: 'infra_aplicada' },
} as const satisfies Record<Step, unknown>;

/**
 * "Criar infraestrutura" (#825): a execução aberta do site (só o id e o estado) e as actions
 * de pedir o plano, lê-lo e confirmá-lo, ligadas ao site. `retry`: a última criação falhou, e o
 * botão vira "Tentar de novo" (#826), uma nova execução com novo plano e nova confirmação.
 */
export type CreateInfraActions = {
  open: Pick<OpenInfraRun, 'id' | 'status'> | null;
  retry?: boolean;
  request: () => Promise<{ ok: true; runId: number } | { ok: false; message: string }>;
  read: (runId: number) => Promise<InfraPlanView | null>;
  confirm: (runId: number) => Promise<ActionResult>;
};

/**
 * "Remover infraestrutura" (workspace#97), só para quem tem `site.destroy`: o domínio a digitar,
 * as páginas no ar, se o site está ativo (a ação fica desabilitada, com o aviso de pausar), a
 * execução aberta (com o tipo, para reabrir só a de remoção) e as actions ligadas ao site. A
 * leitura do plano é a mesma da criação. `retry`: a última remoção falhou, e o botão vira "Tentar
 * de novo", uma nova execução com novo plano e o domínio digitado de novo.
 */
export type RemoveInfraActions = {
  domain: string;
  activePages: number | null;
  active: boolean;
  open: Pick<OpenInfraRun, 'id' | 'status' | 'kind'> | null;
  retry?: boolean;
  request: () => Promise<{ ok: true; runId: number } | { ok: false; message: string }>;
  read: (runId: number) => Promise<InfraPlanView | null>;
  confirm: (runId: number, typedDomain: string) => Promise<ActionResult>;
};

/**
 * "Reaplicar infraestrutura" (workspace#98), só para quem tem `site.configure`: a execução aberta
 * (com o tipo e se é de um lote, para reabrir só a reaplicação pedida no site) e as actions
 * ligadas ao site. `retry`: a última reaplicação falhou, e o botão vira "Tentar de novo". A
 * leitura do plano é a mesma da criação.
 */
export type ReapplyInfraActions = {
  open: Pick<OpenInfraRun, 'id' | 'status' | 'kind' | 'inBatch'> | null;
  retry?: boolean;
  request: () => Promise<{ ok: true; runId: number } | { ok: false; message: string }>;
  read: (runId: number) => Promise<InfraPlanView | null>;
  confirm: (runId: number) => Promise<ActionResult>;
};

const LifecycleActionContext = createContext<ReturnType<typeof useActionResult> | null>(null);

/**
 * Guarda o estado da ação do ciclo de vida fora do item da etapa: ao avançar, a página
 * revalida e o botão passa ao item seguinte (remontado), mas o erro continua no Alert logo
 * abaixo do stepper (#148).
 */
export function LifecycleActionScope({ children }: { children: ReactNode }) {
  const state = useActionResult();
  return (
    <LifecycleActionContext value={state}>
      {children}
      <ActionAlert error={state.error} />
    </LifecycleActionContext>
  );
}

/**
 * As ações da etapa "Infra e zona": "Criar infraestrutura" (#825) num site `cadastrado` sem
 * execução aberta, ou "Revisar e confirmar" com a execução `planejando` ou
 * `aguardando_confirmacao` (reabre o diálogo no estado salvo; nenhuma das duas com `aplicando`),
 * quando a página passa `infra`; "Conferir agora" (workspace#85), que enfileira a conferência
 * da infra só deste site, enquanto a conferência ainda tem o que avançar (`cadastrado`,
 * `infra_aplicada`), e o caminho de volta da etapa atual ("Desmarcar", com confirmação; #714);
 * `publicado` vem do build e não se desmarca. Com conferência pedida ou na fila, "Conferir agora"
 * diz "Conferindo…" e fica `aria-disabled` (não `disabled`: o foco continua no botão até o
 * resultado, como nas ações de operação). A etapa e a fila vêm da conferência relida pela aba
 * (`InfraCheckContext`); fora dela, da `lifecycle` da página. Com `remove` (só `site.destroy`),
 * "Remover infraestrutura" (workspace#97) de `infra_aplicada` em diante, sem outra execução
 * aberta: desabilitada, com o aviso de pausar, enquanto o site está ativo; "Revisar e confirmar a
 * remoção" reabre a remoção aberta no estado salvo; com a última remoção em falha, o botão vira
 * "Tentar de novo". Com `reapply` (só `site.configure`), "Reaplicar infraestrutura"
 * (workspace#98) de `infra_aplicada` em diante, sem execução aberta ("Tentar de novo" depois de
 * uma reaplicação que falhou); "Revisar e confirmar a reaplicação" reabre a reaplicação aberta no
 * estado salvo, menos a de um lote, que se confirma no lote. Sem nenhuma ação não renderiza nada.
 * Fica dentro de um `LifecycleActionScope`: o erro de qualquer uma vai ao mesmo
 * Alert.
 */
export function LifecycleAction({
  lifecycle: pageLifecycle,
  check,
  undo,
  infra,
  remove,
  reapply,
}: {
  lifecycle: SiteSummary['lifecycle'];
  check: () => Promise<ActionResult>;
  undo: (step: Step) => Promise<ActionResult>;
  infra?: CreateInfraActions;
  remove?: RemoveInfraActions;
  reapply?: ReapplyInfraActions;
}) {
  const scope = use(LifecycleActionContext);
  const view = useInfraCheckContext();
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState<'check' | 'undo' | 'infra' | 'remove' | 'reapply' | null>(
    null,
  );
  const creating = useCreateInfra({
    request: infra?.request ?? noRequest,
    read: infra?.read ?? noRead,
  });
  const removing = useCreateInfra({
    request: remove?.request ?? noRequest,
    read: remove?.read ?? noRead,
    alreadyConfirmed: INFRA_REMOVAL_ALREADY_CONFIRMED,
  });
  const reapplying = useCreateInfra({
    request: reapply?.request ?? noRequest,
    read: reapply?.read ?? noRead,
    alreadyConfirmed: INFRA_REAPPLY_ALREADY_CONFIRMED,
  });
  const infraTrigger = useRef<HTMLButtonElement>(null);
  const reapplyTrigger = useRef<HTMLButtonElement>(null);
  const removeTrigger = useRef<HTMLButtonElement>(null);
  const pauseHintId = useId();
  if (scope === null) throw new Error('LifecycleAction fora de um LifecycleActionScope.');
  const lifecycle = view?.check.lifecycle ?? pageLifecycle;
  const queued = view?.check.queued ?? false;
  const checkable = lifecycle === 'cadastrado' || lifecycle === 'infra_aplicada';
  const current = lifecycle === 'infra_aplicada' || lifecycle === 'zona_ativa' ? lifecycle : null;
  const openRun = infra?.open ?? null;
  const creatable =
    infra !== undefined && lifecycle === 'cadastrado' && openRun?.status !== 'aplicando';
  // A remoção aberta (planejando ou aguardando) reabre o diálogo; outra execução aberta a esconde.
  const removalRun = remove?.open ?? null;
  const reviewRemoval =
    removalRun !== null && removalRun.kind === 'remover' && removalRun.status !== 'aplicando';
  const removable =
    remove !== undefined && lifecycle !== 'cadastrado' && (removalRun === null || reviewRemoval);
  // A reaplicação aberta pedida no site reabre o diálogo; a de um lote e outra execução a escondem.
  const reapplyRun = reapply?.open ?? null;
  const reviewReapply =
    reapplyRun !== null &&
    reapplyRun.kind === 'reaplicar' &&
    !reapplyRun.inBatch &&
    reapplyRun.status !== 'aplicando';
  const reapplyable =
    reapply !== undefined && lifecycle !== 'cadastrado' && (reapplyRun === null || reviewReapply);
  if (!checkable && current === null && !creatable && !removable && !reapplyable) return null;
  const pending = (kind: 'check' | 'undo' | 'infra' | 'remove' | 'reapply') =>
    scope.pending && running === kind;

  return (
    <span className="flex flex-wrap gap-2">
      {creatable && (
        <Button
          ref={infraTrigger}
          type="button"
          size="sm"
          variant="solid"
          disabled={scope.pending}
          onClick={() => (openRun === null ? creating.start() : creating.reopen(openRun.id))}
        >
          {pending('infra')
            ? 'Confirmando…'
            : openRun !== null
              ? 'Revisar e confirmar'
              : infra.retry
                ? 'Tentar de novo'
                : 'Criar infraestrutura'}
          {(openRun !== null || infra.retry) && !pending('infra') && (
            <span className="sr-only"> a criação da infraestrutura</span>
          )}
        </Button>
      )}
      {infra !== undefined && (
        <CreateInfraDialog
          isOpen={creating.isOpen}
          state={creating.state}
          onCancel={creating.close}
          onConfirm={() => {
            const runId = creating.runId;
            creating.close();
            if (runId === null) return;
            setRunning('infra');
            scope.run(() => infra.confirm(runId));
          }}
          onAfterClose={() => infraTrigger.current?.focus()}
        />
      )}
      {checkable && (
        <Button
          type="button"
          size="sm"
          aria-disabled={scope.pending || queued || undefined}
          onClick={() => {
            if (scope.pending || queued) return;
            setRunning('check');
            scope.run(check);
          }}
        >
          {pending('check') || queued ? 'Conferindo…' : 'Conferir agora'}
        </Button>
      )}
      {current && (
        <>
          <Button
            type="button"
            size="sm"
            disabled={scope.pending}
            onClick={() => setConfirming(true)}
          >
            {pending('undo') ? 'Desmarcando…' : 'Desmarcar'}
            <span className="sr-only"> {UNDO_STEP[current].label}</span>
          </Button>
          <ConfirmDialog
            isOpen={confirming}
            type="warning"
            title={`Desmarcar ${UNDO_STEP[current].label}?`}
            confirmText="Desmarcar"
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false);
              setRunning('undo');
              scope.run(() => undo(current));
            }}
          >
            <p>
              A etapa volta para "{INFRA_STEP_TEXT[UNDO_STEP[current].back]}". Se o provedor ainda
              confirmar a infra e a zona, a próxima conferência automática marca a etapa de novo.
            </p>
          </ConfirmDialog>
        </>
      )}
      {reapplyable && (
        <Button
          ref={reapplyTrigger}
          type="button"
          size="sm"
          disabled={scope.pending}
          onClick={() =>
            reapplyRun === null ? reapplying.start() : reapplying.reopen(reapplyRun.id)
          }
        >
          {pending('reapply')
            ? 'Confirmando…'
            : reviewReapply
              ? 'Revisar e confirmar a reaplicação'
              : reapply.retry
                ? 'Tentar de novo'
                : 'Reaplicar infraestrutura'}
          {!reviewReapply && reapply.retry && !pending('reapply') && (
            <span className="sr-only"> a reaplicação da infraestrutura</span>
          )}
        </Button>
      )}
      {reapply !== undefined && (
        <ReapplyInfraDialog
          isOpen={reapplying.isOpen}
          state={reapplying.state}
          onCancel={reapplying.close}
          onConfirm={() => {
            const runId = reapplying.runId;
            reapplying.close();
            if (runId === null) return;
            setRunning('reapply');
            scope.run(() => reapply.confirm(runId));
          }}
          onAfterClose={() => reapplyTrigger.current?.focus()}
        />
      )}
      {removable && (
        <>
          <Button
            ref={removeTrigger}
            type="button"
            size="sm"
            customColorClass={dangerButtonClass}
            disabled={scope.pending || remove.active}
            aria-describedby={remove.active ? pauseHintId : undefined}
            onClick={() =>
              removalRun === null ? removing.start() : removing.reopen(removalRun.id)
            }
          >
            {pending('remove')
              ? 'Confirmando…'
              : reviewRemoval
                ? 'Revisar e confirmar a remoção'
                : remove.retry
                  ? 'Tentar de novo'
                  : 'Remover infraestrutura'}
            {!reviewRemoval && remove.retry && !pending('remove') && (
              <span className="sr-only"> a remoção da infraestrutura</span>
            )}
          </Button>
          {remove.active && (
            <span id={pauseHintId} className="basis-full text-sm">
              {INFRA_REMOVAL_PAUSE_FIRST}
            </span>
          )}
        </>
      )}
      {remove !== undefined && (
        <RemoveInfraDialog
          isOpen={removing.isOpen}
          state={removing.state}
          domain={remove.domain}
          activePages={remove.activePages}
          onCancel={removing.close}
          onConfirm={(typedDomain) => {
            const runId = removing.runId;
            removing.close();
            if (runId === null) return;
            setRunning('remove');
            scope.run(() => remove.confirm(runId, typedDomain));
          }}
          onAfterClose={() => removeTrigger.current?.focus()}
        />
      )}
    </span>
  );
}

const noRequest = () => Promise.resolve({ ok: false as const, message: '' });
const noRead = () => Promise.resolve(null);

/** Recusa do formulário: as issues com `path` vão ao campo; sem nenhuma, a mensagem vai ao resumo. */
function outcome(result: SiteFormResult) {
  if (result.ok) return { success: result.message };
  return result.issues.length > 0 ? result.issues : [{ path: [], message: result.message }];
}

/**
 * Registro do G1 com observação opcional, gerado do schema (#333): o cartão inteiro da seção,
 * com `intro` (título, dica e estado) e "Registrar G1" no rodapé, em `sm` como as outras ações
 * da página do site (#370).
 */
export function RegisterG1Form({
  intro,
  action,
}: {
  intro: ReactNode;
  action: (value: RegisterG1Value) => Promise<SiteFormResult>;
}) {
  return (
    <SchemaForm
      schema={RegisterG1Schema}
      defaultValues={{ note: '' }}
      labels={{ note: 'Observação do G1' }}
      card={{ intro, size: 'sm' }}
      submitLabel="Registrar G1"
      pendingLabel="Registrando G1…"
      onSubmit={async (value) => outcome(await action(value))}
    />
  );
}

/**
 * Janela própria em segundos, gerada do schema (#333); "Usar padrão" (ação secundária do
 * rodapé, sem passar pelo schema) volta a BUILD_WINDOW_SECONDS. Botões em `sm` (#370).
 */
export function BuildWindowForm({
  intro,
  own,
  action,
}: {
  intro: ReactNode;
  own: number | null;
  action: (value: BuildWindowValue | null) => Promise<SiteFormResult>;
}) {
  return (
    <SchemaForm
      schema={BuildWindowSchema}
      defaultValues={{ buildWindowSeconds: own ?? '' }}
      labels={{ buildWindowSeconds: 'Janela própria (segundos)' }}
      card={{
        intro,
        size: 'sm',
        extra: {
          label: 'Usar padrão',
          pendingLabel: 'Usando padrão…',
          resetTo: { buildWindowSeconds: '' },
          run: async () => outcome(await action(null)),
        },
      }}
      submitLabel="Salvar"
      pendingLabel="Salvando…"
      onSubmit={async (value) => outcome(await action(value))}
    />
  );
}

/**
 * Limite diário próprio de publicações (#490), no molde da janela: gerado do schema, e
 * "Usar padrão" volta a PUBLISH_DAILY_LIMIT sem passar pelo schema.
 */
export function DailyPublishLimitForm({
  intro,
  own,
  action,
}: {
  intro: ReactNode;
  own: number | null;
  action: (value: DailyPublishLimitValue | null) => Promise<SiteFormResult>;
}) {
  return (
    <SchemaForm
      schema={DailyPublishLimitSchema}
      defaultValues={{ dailyPublishLimit: own ?? '' }}
      labels={{ dailyPublishLimit: 'Limite próprio (publicações por dia)' }}
      card={{
        intro,
        size: 'sm',
        extra: {
          label: 'Usar padrão',
          pendingLabel: 'Usando padrão…',
          resetTo: { dailyPublishLimit: '' },
          run: async () => outcome(await action(null)),
        },
      }}
      submitLabel="Salvar"
      pendingLabel="Salvando…"
      onSubmit={async (value) => outcome(await action(value))}
    />
  );
}
