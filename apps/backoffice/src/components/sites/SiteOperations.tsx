'use client';

import { createContext, use, useRef, useState, useTransition, type ReactNode } from 'react';

import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import { dangerButtonClass } from '@/components/shared/ConfirmDialog.tsx';
import EllipsisButton from '@/components/shared/EllipsisButton';
import { Button } from '@/components/ui/Button';
import Dropdown from '@/components/ui/Dropdown';
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

// Ações de operação da página do site no cabeçalho (#595), no layout do `CustomerDetails` do
// Ecme: a principal ("Publicar agora" ou, com o site pausado, "Retomar") e o `Dropdown` "Mais
// ações" com "Reconstruir na release" (#515) e "Reverter" (#514), como o `MoreActions` da lista
// de sites (#586). Cada uma confirma no diálogo de hoje, aberto daqui; o sucesso vai ao toast e
// a recusa de qualquer uma ao `ActionAlert` logo abaixo do cabeçalho, do `SiteOperationsScope`.
// A página só monta as ações com operations.run.

type Scope = ReturnType<typeof useActionResult>;

const SiteOperationsContext = createContext<Scope | null>(null);

/**
 * Guarda o retorno das ações do cabeçalho e põe o `ActionAlert` depois dos filhos (o
 * `PageHeader`): o erro fica logo abaixo do cabeçalho, fora da linha dos botões.
 */
export function SiteOperationsScope({ children }: { children: ReactNode }) {
  const state = useActionResult();
  return (
    <SiteOperationsContext value={state}>
      {children}
      <ActionAlert error={state.error} />
    </SiteOperationsContext>
  );
}

type Operation = 'publish' | 'resume' | 'rebuild' | 'rollback';

/** Texto do item do menu e de quando a ação está na fila. */
const MENU_LABEL = {
  rebuild: { idle: 'Reconstruir na release', pending: 'Reconstruindo…' },
  rollback: { idle: 'Reverter', pending: 'Revertendo…' },
} as const;

/**
 * O botão principal e o "Mais ações" do site. `publish`, `resume`, `rebuild` e `rollback` só vêm
 * de quem tem operations.run; publicar aparece com o site fora da pausa e retomar com ele
 * pausado. Uma ação de cada vez: enquanto uma está na fila, os gatilhos ficam `aria-disabled`
 * (não `disabled`: o diálogo fecha antes da resposta, e o foco volta ao gatilho).
 */
export function SiteOperations({
  siteId,
  paused,
  release,
  timeZone,
  publish,
  resume,
  rebuild,
  rollback,
}: {
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
}) {
  const scope = use(SiteOperationsContext);
  if (scope === null) throw new Error('SiteOperations fora de um SiteOperationsScope.');
  const [open, setOpen] = useState<Operation | null>(null);
  const [running, setRunning] = useState<Operation | null>(null);
  const [, startTransition] = useTransition();
  const main = useRef<HTMLButtonElement>(null);
  // O item que abriu o diálogo some com o menu; o foco volta ao gatilho dele.
  const menu = useRef<HTMLSpanElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const primary = paused
    ? resume && { operation: 'resume' as const, label: RESUME_SITE_LABEL }
    : publish && { operation: 'publish' as const, label: PUBLISH_NOW_LABEL };

  const openFrom = (operation: Operation, trigger: HTMLElement | null) => {
    if (running !== null) return;
    returnFocus.current = trigger;
    setOpen(operation);
  };
  const execute = (operation: Operation, action: () => Promise<ActionResult>) => {
    setOpen(null);
    setRunning(operation);
    scope.fail(null);
    startTransition(async () => {
      try {
        scope.report(await action());
      } finally {
        setRunning(null);
      }
    });
  };
  const close = () => setOpen(null);
  const afterClose = () => returnFocus.current?.focus();
  const menuTrigger = () => menu.current?.querySelector<HTMLElement>('[role="button"]') ?? null;

  return (
    <>
      {primary && (
        <Button
          ref={main}
          type="button"
          size="sm"
          customColorClass={dangerButtonClass}
          aria-disabled={running !== null || undefined}
          onClick={() => openFrom(primary.operation, main.current)}
        >
          {running === primary.operation ? primary.label.pending : primary.label.idle}
          <span className="sr-only"> {siteId}</span>
        </Button>
      )}
      {(rebuild || rollback) && (
        <span ref={menu} className="flex">
          <Dropdown
            aria-label={`Mais ações: ${siteId}`}
            placement="bottom-end"
            renderTitle={
              <EllipsisButton
                asElement="span"
                aria-hidden="true"
                aria-label={`Mais ações: ${siteId}`}
                variant="default"
                size="sm"
              />
            }
          >
            {rebuild && (
              <Dropdown.Item
                disabled={running !== null}
                onClick={() => openFrom('rebuild', menuTrigger())}
              >
                {running === 'rebuild' ? MENU_LABEL.rebuild.pending : MENU_LABEL.rebuild.idle}
              </Dropdown.Item>
            )}
            {rollback && (
              <Dropdown.Item
                disabled={running !== null}
                onClick={() => openFrom('rollback', menuTrigger())}
              >
                {running === 'rollback' ? MENU_LABEL.rollback.pending : MENU_LABEL.rollback.idle}
              </Dropdown.Item>
            )}
          </Dropdown>
        </span>
      )}
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
    </>
  );
}
