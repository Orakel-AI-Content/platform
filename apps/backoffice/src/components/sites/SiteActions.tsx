'use client';

import { createContext, use, useState, type ReactNode } from 'react';

import { SchemaForm } from '@/components/forms/SchemaForm';
import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog from '@/components/shared/ConfirmDialog.tsx';
import { INFRA_STEP_TEXT } from '@/components/shared/siteLabels.ts';
import { Button } from '@/components/ui/Button';
import type { SiteSummary } from '@/domain/sites/sites.ts';

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
 * As ações da etapa "Infra e zona": "Conferir agora" (workspace#85), que enfileira a conferência
 * da infra só deste site, enquanto a conferência ainda tem o que avançar (`cadastrado`,
 * `infra_aplicada`), e o caminho de volta da etapa atual ("Desmarcar", com confirmação; #714);
 * `publicado` vem do build e não se desmarca. Com conferência na fila, "Conferir agora" fica
 * desabilitado e diz "Conferindo…". A etapa e a fila vêm da conferência relida pela aba
 * (`InfraCheckContext`); fora dela, da `lifecycle` da página. Sem nenhuma ação (publicado) não
 * renderiza nada. Fica dentro de um `LifecycleActionScope`: o erro de qualquer uma vai ao mesmo
 * Alert.
 */
export function LifecycleAction({
  lifecycle: pageLifecycle,
  check,
  undo,
}: {
  lifecycle: SiteSummary['lifecycle'];
  check: () => Promise<ActionResult>;
  undo: (step: Step) => Promise<ActionResult>;
}) {
  const scope = use(LifecycleActionContext);
  const view = useInfraCheckContext();
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState<'check' | 'undo' | null>(null);
  if (scope === null) throw new Error('LifecycleAction fora de um LifecycleActionScope.');
  const lifecycle = view?.check.lifecycle ?? pageLifecycle;
  const queued = view?.check.queued ?? false;
  const checkable = lifecycle === 'cadastrado' || lifecycle === 'infra_aplicada';
  const current = lifecycle === 'infra_aplicada' || lifecycle === 'zona_ativa' ? lifecycle : null;
  if (!checkable && current === null) return null;
  const pending = (kind: 'check' | 'undo') => scope.pending && running === kind;

  return (
    <span className="flex flex-wrap gap-2">
      {checkable && (
        <Button
          type="button"
          size="sm"
          disabled={scope.pending || queued}
          onClick={() => {
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
    </span>
  );
}

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
