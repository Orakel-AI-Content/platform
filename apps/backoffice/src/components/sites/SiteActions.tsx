'use client';

import { createContext, use, type ReactNode } from 'react';

import { SchemaForm } from '@/components/forms/SchemaForm';
import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import { Button } from '@/components/ui/Button';
import type { SiteSummary } from '@/domain/sites/sites.ts';

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

const NEXT_STEP = {
  cadastrado: {
    step: 'infra_aplicada',
    label: 'Marcar infra aplicada',
    pendingLabel: 'Marcando infra aplicada…',
  },
  infra_aplicada: {
    step: 'zona_ativa',
    label: 'Marcar zona ativa',
    pendingLabel: 'Marcando zona ativa…',
  },
} as const;

type Step = (typeof NEXT_STEP)[keyof typeof NEXT_STEP]['step'];

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
 * Só o próximo passo manual válido; `publicado` vem do build. Sem passo manual não renderiza
 * nada (zona ativa e publicado). Fica dentro de um `LifecycleActionScope`.
 */
export function LifecycleAction({
  lifecycle,
  action,
}: {
  lifecycle: SiteSummary['lifecycle'];
  action: (step: Step) => Promise<ActionResult>;
}) {
  const scope = use(LifecycleActionContext);
  if (scope === null) throw new Error('LifecycleAction fora de um LifecycleActionScope.');
  if (lifecycle !== 'cadastrado' && lifecycle !== 'infra_aplicada') return null;
  const next = NEXT_STEP[lifecycle];
  return (
    <Button
      type="button"
      size="sm"
      disabled={scope.pending}
      onClick={() => scope.run(() => action(next.step))}
    >
      {scope.pending ? next.pendingLabel : next.label}
    </Button>
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
