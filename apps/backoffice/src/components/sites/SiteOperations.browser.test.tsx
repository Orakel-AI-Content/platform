import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { appElementWarnings, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import { toast } from '@/components/ui/toast';
import type { OpenExecution, SiteActivity } from '@/domain/builds/builds.ts';

import {
  SiteOperationButton,
  SiteOperationsAlert,
  SiteOperationsScope,
} from './SiteOperations.tsx';
import { SitePublicationSteps } from './SitePublicationSteps.tsx';

// Ações de operação nas etapas da aba "Publicação" em Chromium (#648): cada botão abre a
// confirmação de hoje com o foco preso, a action só roda depois de confirmar, e fechar devolve
// o foco ao botão da etapa. "Cancelar" e "Desfazer última publicação" (#649) seguem o mesmo
// caminho; quando a publicação cancelada fecha, o foco fica no "Publicar agora" da etapa.

const RELEASES = [{ tag: '1.3.0', imageStatus: 'disponivel' as const }];
const VERSIONS = [
  {
    versionId: '20261010T120000Z-bbbbbbbb',
    release: '1.2.0',
    pages: 12,
    finishedAt: new Date('2026-10-10T12:00:00Z'),
  },
];

const QUEUED: OpenExecution = {
  id: 7,
  kind: 'build',
  status: 'na_fila',
  currentStage: null,
  scheduledFor: null,
  startedAt: null,
  requestedBy: 'ana@orakel.local',
  cancelRequestedAt: null,
};
const RUNNING: OpenExecution = { ...QUEUED, status: 'rodando', currentStage: 'render' };
const IDLE: SiteActivity = { open: null, history: [] };

const ok = () => vi.fn(() => Promise.resolve({ ok: true as const, message: 'ok' }));

type Actions = {
  publish: ReturnType<typeof ok>;
  resume: ReturnType<typeof ok>;
  rebuild: ReturnType<typeof ok>;
  rollback: ReturnType<typeof ok>;
  cancel: ReturnType<typeof ok>;
  undo: ReturnType<typeof ok>;
};

const allActions = (): Actions => ({
  publish: ok(),
  resume: ok(),
  rebuild: ok(),
  rollback: ok(),
  cancel: ok(),
  undo: ok(),
});

function Panel({
  paused,
  actions,
  activity = IDLE,
}: {
  paused: boolean;
  actions: Actions;
  activity?: SiteActivity;
}) {
  return (
    <main>
      <SiteOperationsScope
        siteId="exemplo-a"
        paused={paused}
        release="1.2.0"
        timeZone="America/Sao_Paulo"
        publish={actions.publish}
        resume={actions.resume}
        rebuild={{ releases: RELEASES, action: actions.rebuild }}
        rollback={{ versions: VERSIONS, action: actions.rollback }}
        cancel={actions.cancel}
        undo={{ version: VERSIONS[0]!, action: actions.undo }}
      >
        <SitePublicationSteps
          site={{
            lifecycle: 'publicado',
            release: '1.2.0',
            activeVersionId: 'v41',
            state: paused ? 'pausado' : 'ativo',
            pausedReason: null,
            timeZone: 'America/Sao_Paulo',
          }}
          instance={{ activePages: 120, activeSince: null }}
          activity={activity}
          actions={{
            versao: <SiteOperationButton operation="rebuild" />,
            build: <SiteOperationButton operation="publish" />,
            cancel: <SiteOperationButton operation="cancel" />,
            no_ar: (
              <span className="flex flex-wrap gap-2">
                <SiteOperationButton operation="undo" />
                <SiteOperationButton operation="rollback" />
              </span>
            ),
            site: <SiteOperationButton operation="resume" />,
          }}
        />
        <SiteOperationsAlert />
      </SiteOperationsScope>
    </main>
  );
}

afterEach(() => {
  toast.removeAll();
  vi.restoreAllMocks();
});

const CASES = [
  {
    operation: 'rebuild',
    button: 'Reconstruir na release exemplo-a',
    dialog: 'Reconstruir o site numa release?',
    confirm: 'Reconstruir',
    paused: false,
  },
  {
    operation: 'publish',
    button: 'Publicar agora exemplo-a',
    dialog: 'Publicar exemplo-a agora?',
    confirm: 'Publicar',
    paused: false,
  },
  {
    operation: 'rollback',
    button: 'Escolher outra versão exemplo-a',
    dialog: 'Reverter o site para uma versão anterior?',
    confirm: 'Reverter',
    paused: false,
  },
  {
    operation: 'resume',
    button: 'Retomar exemplo-a',
    dialog: 'Retomar exemplo-a?',
    confirm: 'Retomar',
    paused: true,
  },
  {
    operation: 'cancel',
    button: 'Cancelar exemplo-a',
    dialog: 'Cancelar a publicação de exemplo-a?',
    confirm: 'Cancelar publicação',
    paused: false,
  },
  {
    operation: 'undo',
    button: 'Desfazer última publicação exemplo-a',
    dialog: 'Desfazer a última publicação de exemplo-a?',
    confirm: 'Desfazer',
    paused: false,
  },
] as const;

/** O painel cuja publicação fecha quando o "Cancelar" responde, como o polling traria. */
function ClosingPanel({ actions, open }: { actions: Actions; open: OpenExecution }) {
  const [activity, setActivity] = useState<SiteActivity>({ open, history: [] });
  const cancel = vi.fn(() => {
    setActivity(IDLE);
    return actions.cancel();
  });
  return <Panel paused={false} actions={{ ...actions, cancel }} activity={activity} />;
}

describe('ações nas etapas no navegador', () => {
  it.each(CASES)(
    '"$button": Esc não roda e devolve o foco; confirmar roda e devolve o foco',
    async ({ operation, button, dialog, confirm, paused }) => {
      const warnings = appElementWarnings();
      const actions = allActions();
      await renderInApp(
        <Panel
          paused={paused}
          actions={actions}
          activity={operation === 'cancel' ? { open: RUNNING, history: [] } : IDLE}
        />,
      );
      const trigger = page.getByRole('button', { name: button });
      const confirmation = page.getByRole('alertdialog', { name: dialog });

      (trigger.element() as HTMLElement).focus();
      await userEvent.keyboard('{Enter}');
      await expect.element(confirmation).toBeVisible();
      await expectFocusTrapped(confirmation);
      await userEvent.keyboard('{Escape}');
      await expect.element(confirmation).not.toBeInTheDocument();
      await expect.element(trigger).toHaveFocus();
      expect(actions[operation]).not.toHaveBeenCalled();

      await userEvent.click(trigger);
      await userEvent.click(confirmation.getByRole('button', { name: confirm }));
      await expect.element(confirmation).not.toBeInTheDocument();
      await expect.poll(() => actions[operation]).toHaveBeenCalledTimes(1);
      await expect.element(trigger).toHaveFocus();
      expect(warnings()).toEqual([]);
    },
  );
});

describe('"Cancelar" no navegador', () => {
  it.each([
    ['na fila', QUEUED],
    ['em andamento', RUNNING],
  ])('%s: confirmado, a publicação fecha e o foco fica no "Publicar agora"', async (_, open) => {
    const actions = allActions();
    await renderInApp(<ClosingPanel actions={actions} open={open} />);
    const cancel = page.getByRole('button', { name: 'Cancelar exemplo-a' });
    const confirmation = page.getByRole('alertdialog', {
      name: 'Cancelar a publicação de exemplo-a?',
    });

    await userEvent.click(cancel);
    await userEvent.click(confirmation.getByRole('button', { name: 'Cancelar publicação' }));

    await expect.poll(() => actions.cancel).toHaveBeenCalledTimes(1);
    const publish = page.getByRole('button', { name: 'Publicar agora exemplo-a' });
    await expect.element(publish).toBeVisible();
    await expect.element(publish).toHaveFocus();
    await expect.element(cancel).not.toBeInTheDocument();
  });
});
