'use client';

import { createContext, use, useRef, useState, useTransition, type ReactNode } from 'react';

import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import ConfirmDialog, {
  dangerButtonClass,
  dangerConfirmButtonProps,
} from '@/components/shared/ConfirmDialog.tsx';
import { previousVersionText, revertReleaseText } from '@/components/shared/siteLabels.ts';
import { Button } from '@/components/ui/Button';
import type { RollbackVersion } from '@/domain/builds/builds.ts';

import { PAUSE_SITE_LABEL, PauseSiteDialog } from './PauseSiteDialog.tsx';
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
// #595). Na Versão: "Atualizar para a mais recente" (#690), só quando há release disponível mais
// recente que a do site; "Voltar à versão anterior (X)" (#691), só quando a troca de versão mais
// recente veio de uma release ainda disponível; e "Escolher outra versão do motor" (o
// "Reconstruir na release" de #515). "Publicar agora" na Build, com "Cancelar" (#649) ao lado na
// fila e no lugar dele em andamento. Na No ar, "Desfazer última publicação" (#649) e "Escolher
// outra versão" (o "Reverter" de #514). Na linha Site, "Pausar" com motivo (#650) com o site
// ativo ou "Retomar" com ele pausado. O `SiteOperationsScope` guarda o estado comum e monta cada
// diálogo de confirmação uma vez; cada etapa recebe só o seu `SiteOperationButton`. O sucesso vai
// ao toast e a recusa de qualquer uma ao `SiteOperationsAlert`, logo abaixo do painel. A página
// só monta o escopo com operations.run.

export type SiteOperation =
  'publish' | 'pause' | 'resume' | 'rebuild' | 'rollback' | 'cancel' | 'undo' | 'update' | 'revert';

/** "Pausar" com o motivo informado, já ligado ao site. */
export type PauseSite = (reason: string) => Promise<ActionResult>;

/** Server Action ligada a um site por `siteId`, como a de "Publicar agora". */
export type SiteAction = (siteId: string) => Promise<ActionResult>;

export type SiteOperationsProps = {
  siteId: string;
  paused: boolean;
  /** Release atual do site, de onde o "Escolher outra versão do motor" começa. */
  release: string | null;
  timeZone: string;
  publish?: PublishNow;
  pause?: PauseSite;
  resume?: ResumeSite;
  /** Releases `disponivel` e a action de reconstruir, já ligada ao site. */
  rebuild?: { releases: readonly RebuildRelease[]; action: RebuildOnRelease };
  /** Versões revertíveis (sem a ativa) e a action de reverter, já ligada ao site. */
  rollback?: { versions: readonly RollbackVersion[]; action: RollbackSite };
  /** "Cancelar" a publicação na fila ou em andamento (#649). */
  cancel?: SiteAction;
  /**
   * "Desfazer última publicação" (#649): a versão para onde o site volta, só mostrada (o domínio
   * a resolve de novo ao executar), e a action. Sem versão anterior, a página não passa.
   */
  undo?: { version: RollbackVersion; action: SiteAction };
  /**
   * "Atualizar para a mais recente" (#690): a release `disponivel` mais recente, já resolvida pela
   * página (só quando difere da do site), e a action de reconstruir, já ligada ao site.
   */
  update?: { tag: string; action: RebuildOnRelease };
  /**
   * "Voltar à versão anterior" (#691): a release de onde veio a última troca de versão, só
   * mostrada (o domínio a resolve de novo ao executar), e a action. Sem anterior válida, a página
   * não passa.
   */
  revert?: { tag: string; action: SiteAction };
};

type Scope = {
  operations: SiteOperationsProps;
  running: SiteOperation | null;
  error: string | null;
  open: (operation: SiteOperation, trigger: HTMLElement) => void;
  /** Guarda (ou, com `null`, esquece) o botão montado de cada operação. */
  register: (operation: SiteOperation, trigger: HTMLElement | null) => void;
};

const SiteOperationsContext = createContext<Scope | null>(null);

/** Texto do botão de cada operação e de quando ela está na fila. */
const LABEL: Record<SiteOperation, { idle: string; pending: string }> = {
  publish: PUBLISH_NOW_LABEL,
  pause: PAUSE_SITE_LABEL,
  resume: RESUME_SITE_LABEL,
  rebuild: { idle: 'Escolher outra versão do motor', pending: 'Reconstruindo…' },
  rollback: { idle: 'Escolher outra versão', pending: 'Revertendo…' },
  cancel: { idle: 'Cancelar', pending: 'Cancelando…' },
  undo: { idle: 'Desfazer última publicação', pending: 'Desfazendo…' },
  update: { idle: 'Atualizar para a mais recente', pending: 'Atualizando…' },
  revert: { idle: 'Voltar à versão anterior', pending: 'Voltando…' },
};

/** Se a operação vale para o site agora: publicar e pausar fora da pausa, retomar só pausado. */
function available(operations: SiteOperationsProps, operation: SiteOperation): boolean {
  switch (operation) {
    case 'publish':
      return !operations.paused && operations.publish !== undefined;
    case 'pause':
      return !operations.paused && operations.pause !== undefined;
    case 'resume':
      return operations.paused && operations.resume !== undefined;
    case 'rebuild':
      return operations.rebuild !== undefined;
    case 'rollback':
      return operations.rollback !== undefined;
    case 'cancel':
      return operations.cancel !== undefined;
    case 'undo':
      return operations.undo !== undefined;
    case 'update':
      return operations.update !== undefined;
    case 'revert':
      return operations.revert !== undefined;
  }
}

/**
 * As ações de operação do site: `publish`, `pause`, `resume`, `rebuild`, `rollback`, `cancel`,
 * `undo`, `update` e `revert` só vêm de quem tem
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
  const triggers = useRef(new Map<SiteOperation, HTMLElement>());
  const register = (operation: SiteOperation, trigger: HTMLElement | null) => {
    if (trigger === null) triggers.current.delete(operation);
    else triggers.current.set(operation, trigger);
  };
  const {
    siteId,
    paused,
    release,
    timeZone,
    publish,
    pause,
    resume,
    rebuild,
    rollback,
    cancel,
    undo,
    update,
    revert,
  } = operations;

  const openFrom = (operation: SiteOperation, trigger: HTMLElement) => {
    if (running !== null) return;
    returnFocus.current = trigger;
    setOpen(operation);
  };
  const execute = (operation: SiteOperation, action: () => Promise<ActionResult>) => {
    // Cancelar a publicação na fila tira o "Cancelar" da tela: o foco vai ao "Publicar agora",
    // que fica. Em andamento não há outro; o "Cancelar" vira o "Publicar agora" quando fecha.
    if (operation === 'cancel')
      returnFocus.current = triggers.current.get('publish') ?? returnFocus.current;
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
    <SiteOperationsContext
      value={{ operations, running, error: result.error, open: openFrom, register }}
    >
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
      {pause && (
        <PauseSiteDialog
          siteId={siteId}
          isOpen={open === 'pause'}
          onCancel={close}
          onConfirm={(reason) => execute('pause', () => pause(reason))}
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
      {cancel && (
        <ConfirmDialog
          isOpen={open === 'cancel'}
          type="danger"
          title={`Cancelar a publicação de ${siteId}?`}
          cancelText="Voltar"
          confirmText="Cancelar publicação"
          confirmButtonProps={dangerConfirmButtonProps}
          onCancel={close}
          onConfirm={() => execute('cancel', () => cancel(siteId))}
          onAfterClose={afterClose}
        >
          <p>
            Na fila, a publicação sai da fila; em andamento, o build é interrompido. O site no ar
            não muda, e as mudanças pendentes continuam para a próxima publicação.
          </p>
        </ConfirmDialog>
      )}
      {undo && (
        <ConfirmDialog
          isOpen={open === 'undo'}
          type="danger"
          title={`Desfazer a última publicação de ${siteId}?`}
          confirmText="Desfazer"
          confirmButtonProps={dangerConfirmButtonProps}
          onCancel={close}
          onConfirm={() => execute('undo', () => undo.action(siteId))}
          onAfterClose={afterClose}
        >
          <p>O site no ar volta para a versão anterior:</p>
          <p className="mt-2 font-semibold">{previousVersionText(undo.version, timeZone)}</p>
        </ConfirmDialog>
      )}
      {update && (
        <ConfirmDialog
          isOpen={open === 'update'}
          type="danger"
          title={`Atualizar ${siteId} para a versão ${update.tag}?`}
          confirmText="Atualizar"
          confirmButtonProps={dangerConfirmButtonProps}
          onCancel={close}
          onConfirm={() => execute('update', () => update.action(update.tag))}
          onAfterClose={afterClose}
        >
          <p>
            O site passa a usar a versão {update.tag}, o build entra na fila já e o site no ar muda.
            {paused && ' O site sai da pausa.'}
          </p>
        </ConfirmDialog>
      )}
      {revert && (
        <ConfirmDialog
          isOpen={open === 'revert'}
          type="danger"
          title={`Voltar ${siteId} para a versão ${revert.tag}?`}
          confirmText="Voltar"
          confirmButtonProps={dangerConfirmButtonProps}
          onCancel={close}
          onConfirm={() => execute('revert', () => revert.action(siteId))}
          onAfterClose={afterClose}
        >
          <p>
            O site volta a usar a versão {revert.tag}, de onde veio a última troca, o build entra na
            fila já e o site no ar muda.
            {paused && ' O site sai da pausa.'}
          </p>
        </ConfirmDialog>
      )}
    </SiteOperationsContext>
  );
}

/**
 * O botão de uma operação, na etapa dela: abre a confirmação do escopo e recebe o foco de volta
 * ao fechar. Não renderiza nada quando a operação não vale para o site agora (sem a action, ou
 * "Publicar agora" e "Pausar" com o site pausado, "Retomar" fora da pausa).
 */
export function SiteOperationButton({ operation }: { operation: SiteOperation }) {
  const scope = use(SiteOperationsContext);
  if (scope === null) throw new Error('SiteOperationButton fora de um SiteOperationsScope.');
  if (!available(scope.operations, operation)) return null;
  const label = LABEL[operation];
  const idle =
    operation === 'revert' && scope.operations.revert
      ? revertReleaseText(scope.operations.revert.tag)
      : label.idle;
  return (
    <Button
      type="button"
      size="sm"
      customColorClass={dangerButtonClass}
      ref={(element) => {
        scope.register(operation, element);
        return () => scope.register(operation, null);
      }}
      aria-disabled={scope.running !== null || undefined}
      onClick={(event) => scope.open(operation, event.currentTarget)}
    >
      {scope.running === operation ? label.pending : idle}
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
