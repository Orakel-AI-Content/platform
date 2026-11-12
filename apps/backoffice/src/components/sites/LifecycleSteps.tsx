'use client';

import { useRouter } from 'next/navigation';
import { createContext, use, useCallback, useState, type ReactNode } from 'react';

import { INFRA_STEP_TEXT, infraCheckText } from '@/components/shared/siteLabels.ts';
import { usePolling } from '@/components/shared/usePolling.ts';
import type { SiteInfraCheck, SiteSummary } from '@/domain/sites/sites.ts';

/** Leitura do polling (`siteInfraCheckAction` com o site); `null` quando não deu para ler. */
export type SiteInfraCheckStatus = () => Promise<SiteInfraCheck | null>;

/** Intervalo do polling enquanto há conferência na fila. */
export const INFRA_CHECK_POLL_MS = 3000;

/** A conferência e o "agora" com que o "conferido há X" é contado. */
export type InfraCheckView = { check: SiteInfraCheck; now: Date };

/**
 * A conferência corrente da aba "Publicação", para o `LifecycleAction` saber a etapa relida
 * pelo polling e se há conferência na fila; fora de um provedor, `null`.
 */
export const InfraCheckContext = createContext<InfraCheckView | null>(null);

export function useInfraCheckContext(): InfraCheckView | null {
  return use(InfraCheckContext);
}

/**
 * Conferência da infra da aba (workspace#85), no molde do `useSiteActivity`: a da página até o
 * polling trazer outra; quando a página entrega uma nova (depois do `revalidatePath` de
 * "Conferir agora"), ela substitui a do polling. O polling só roda com conferência na fila;
 * quando a conferência acompanhada termina, a página é relida (`router.refresh`), para o resto
 * dela seguir a etapa que o job pode ter avançado. `now` é o da página até a primeira leitura
 * do polling, para o "conferido há X" do servidor e do navegador baterem.
 */
export function useInfraCheck(
  initial: InfraCheckView,
  status: SiteInfraCheckStatus,
  pollMs: number = INFRA_CHECK_POLL_MS,
): InfraCheckView {
  const router = useRouter();
  const [source, setSource] = useState(initial);
  const [view, setView] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setView(initial);
  }
  const poll = useCallback(async () => {
    const next = await status();
    if (next === null) return;
    setView({ check: next, now: new Date() });
    if (!next.queued) router.refresh();
  }, [status, router]);
  usePolling(view.check.queued, poll, pollMs);
  return view;
}

/**
 * Conteúdo da etapa "Infra e zona" do painel da aba "Publicação" (#647; era o `Steps` das quatro
 * etapas do ciclo de vida, #148, #369): o ciclo de vida em texto visível, a situação da
 * conferência automática (workspace#85; `infraCheckText`) e, quando a página a passa, as ações:
 * "Conferir agora" e "Desmarcar", que volta uma etapa com confirmação (#714). Com a última
 * conferência em falha, a etapa diz que não foi possível consultar o provedor no lugar do texto
 * de etapa pendente. A situação fica num `role="status"` sempre montado, para o leitor de tela
 * anunciar "Conferindo…" e o resultado. O erro das ações fica no `ActionAlert` do
 * `LifecycleActionScope`, abaixo do painel.
 */
export function LifecycleSteps({
  current,
  check,
  action,
}: {
  current: SiteSummary['lifecycle'];
  check?: InfraCheckView;
  action?: ReactNode;
}) {
  return (
    <>
      {!(check !== undefined && infraCheckFailed(check.check)) && (
        <span className="block">{INFRA_STEP_TEXT[current]}</span>
      )}
      {check !== undefined && (
        <span role="status" className="block">
          {infraCheckText(check.check, check.now)}
        </span>
      )}
      {action && <span className="mt-2 block">{action}</span>}
    </>
  );
}

/** A última conferência falhou e não há outra na fila: a etapa não aparece como pendente. */
export function infraCheckFailed(check: SiteInfraCheck): boolean {
  return !check.queued && check.error !== null;
}
