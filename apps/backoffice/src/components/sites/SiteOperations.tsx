'use client';

import { createContext, use, useRef, useState, useTransition, type ReactNode } from 'react';

import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import { dangerButtonClass } from '@/components/shared/ConfirmDialog.tsx';
import { Button } from '@/components/ui/Button';
import type { RollbackVersion } from '@/domain/builds/builds.ts';

import {
  RebuildReleaseDialog,
  type RebuildOnRelease,
  type RebuildRelease,
} from './RebuildReleaseDialog.tsx';
import { RollbackDialog, type RollbackSite } from './RollbackDialog.tsx';
import {
  PUBLISH_NOW_LABEL,
  PublishNowDialog,
  RESUME_SITE_LABEL,
  ResumeSiteDialog,
  type PublishNow,
  type ResumeSite,
} from './SiteStatus.tsx';

// Ações de operação da página do site nas etapas da aba "Publicação" (#648; antes no cabeçalho,
// #595): "Reconstruir na release" (#515) na Versão, "Publicar agora" na Build, "Escolher outra
// versão" (o "Reverter" de #514) na No ar e, com o site pausado, "Retomar" na linha Site. O
// `SiteOperationsScope` guarda o estado comum e monta cada diálogo de confirmação uma vez; cada
// etapa recebe só o seu `SiteOperationButton`. O sucesso vai ao toast e a recusa de qualquer
// uma ao `SiteOperationsAlert`, logo abaixo do painel. A página só monta o escopo com
// operations.run.

export type SiteOperation = 'publish' | 'resume' | 'rebuild' | 'rollback';

export type SiteOperationsProps = {
  siteId: string;
  paused: boolean;
  /** Release atual do site, de onde o "Reconstruir" começa. */
  release: string | null;
  timeZone: string;
  publish?: PublishNow;
  resume?: ResumeSite;
  /** Releases registradas (com o estado da imagem) e a action de reconstruir, já ligada ao site. */
  rebuild?: { releases: readonly RebuildRelease[]; action: RebuildOnRelease };
  /** Versões revertíveis (sem a ativa) e a action de reverter, já ligada ao site. */
  rollback?: { versions: readonly RollbackVersion[]; action: RollbackSite };
};

type Scope = {
  operations: SiteOperationsProps;
  running: SiteOperation | null;
  error: string | null;
  open: (operation: SiteOperation, trigger: HTMLElement) => void;
};

const SiteOperationsContext = createContext<Scope | null>(null);

/** Texto do botão de cada operação e de quando ela está na fila. */
const LABEL: Record<SiteOperation, { idle: string; pending: string }> = {
  publish: PUBLISH_NOW_LABEL,
  resume: RESUME_SITE_LABEL,
  rebuild: { idle: 'Reconstruir na release', pending: 'Reconstruindo…' },
  rollback: { idle: 'Escolher outra versão', pending: 'Revertendo…' },
};

/** Se a operação vale para o site agora: publicar fora da pausa, retomar só pausado. */
function available(operations: SiteOperationsProps, operation: SiteOperation): boolean {
  switch (operation) {
    case 'publish':
      return !operations.paused && operations.publish !== undefined;
    case 'resume':
      return operations.paused && operations.resume !== undefined;
    case 'rebuild':
      return operations.rebuild !== undefined;
    case 'rollback':
      return operations.rollback !== undefined;
  }
}

/**
 * As ações de operação do site: `publish`, `resume`, `rebuild` e `rollback` só vêm de quem tem
 * operations.run. Uma ação de cada vez: enquanto uma está na fila, todos os botões ficam
 * `aria-disabled` (não `disabled`: o diálogo fecha antes da resposta, e o foco volta ao botão
 * que o abriu).
 */
export function SiteOperationsScope({
  children,
  ...operations
}: SiteOperationsProps & { children: ReactNode }) {
  const result = useActionResult();
  const [open, setOpen] = useState<SiteOperation | null>(null);
  const [running, setRunning] = useState<SiteOperation | null>(null);
  const [, startTransition] = useTransition();
  const returnFocus = useRef<HTMLElement | null>(null);
  const { siteId, paused, release, timeZone, publish, resume, rebuild, rollback } = operations;

  const openFrom = (operation: SiteOperation, trigger: HTMLElement) => {
    if (running !== null) return;
    returnFocus.current = trigger;
    setOpen(operation);
  };
  const execute = (operation: SiteOperation, action: () => Promise<ActionResult>) => {
    setOpen(null);
    setRunning(operation);
    result.fail(null);
    startTransition(async () => {
      try {
        result.report(await action());
      } finally {
        setRunning(null);
      }
    });
  };
  const close = () => setOpen(null);
  const afterClose = () => returnFocus.current?.focus();

  return (
    <SiteOperationsContext value={{ operations, running, error: result.error, open: openFrom }}>
      {children}
      {publish && (
        <PublishNowDialog
          siteId={siteId}
          isOpen={open === 'publish'}
          onCancel={close}
          onConfirm={() => execute('publish', () => publish(siteId))}
          onAfterClose={afterClose}
        />
      )}
      {resume && (
        <ResumeSiteDialog
          siteId={siteId}
          isOpen={open === 'resume'}
          onCancel={close}
          onConfirm={() => execute('resume', () => resume(siteId))}
          onAfterClose={afterClose}
        />
      )}
      {rebuild && (
        <RebuildReleaseDialog
          current={release}
          paused={paused}
          releases={rebuild.releases}
          isOpen={open === 'rebuild'}
          onCancel={close}
          onConfirm={(tag) => execute('rebuild', () => rebuild.action(tag))}
          onAfterClose={afterClose}
        />
      )}
      {rollback && (
        <RollbackDialog
          versions={rollback.versions}
          timeZone={timeZone}
          isOpen={open === 'rollback'}
          onCancel={close}
          onConfirm={(versionId) => execute('rollback', () => rollback.action(versionId))}
          onAfterClose={afterClose}
        />
      )}
    </SiteOperationsContext>
  );
}

/**
 * O botão de uma operação, na etapa dela: abre a confirmação do escopo e recebe o foco de volta
 * ao fechar. Não renderiza nada quando a operação não vale para o site agora (sem a action, ou
 * "Publicar agora" com o site pausado e "Retomar" fora da pausa).
 */
export function SiteOperationButton({ operation }: { operation: SiteOperation }) {
  const scope = use(SiteOperationsContext);
  if (scope === null) throw new Error('SiteOperationButton fora de um SiteOperationsScope.');
  if (!available(scope.operations, operation)) return null;
  const label = LABEL[operation];
  return (
    <Button
      type="button"
      size="sm"
      customColorClass={dangerButtonClass}
      aria-disabled={scope.running !== null || undefined}
      onClick={(event) => scope.open(operation, event.currentTarget)}
    >
      {scope.running === operation ? label.pending : label.idle}
      <span className="sr-only"> {scope.operations.siteId}</span>
    </Button>
  );
}

/**
 * A recusa de qualquer operação, num `ActionAlert` só (sempre montado). Fora de um
 * `SiteOperationsScope` (quem não tem operations.run), não renderiza nada.
 */
export function SiteOperationsAlert() {
  const scope = use(SiteOperationsContext);
  if (scope === null) return null;
  return <ActionAlert error={scope.error} />;
}
