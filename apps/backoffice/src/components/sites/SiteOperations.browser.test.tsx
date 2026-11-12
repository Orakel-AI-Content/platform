import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { appElementWarnings, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import { toast } from '@/components/ui/toast';

import {
  SiteOperationButton,
  SiteOperationsAlert,
  SiteOperationsScope,
} from './SiteOperations.tsx';
import { SitePublicationSteps } from './SitePublicationSteps.tsx';

// Ações de operação nas etapas da aba "Publicação" em Chromium (#648): cada botão abre a
// confirmação de hoje com o foco preso, a action só roda depois de confirmar, e fechar devolve
// o foco ao botão da etapa.

const RELEASES = [{ tag: '1.3.0', imageStatus: 'disponivel' as const }];
const VERSIONS = [
  {
    versionId: '20261010T120000Z-bbbbbbbb',
    release: '1.2.0',
    pages: 12,
    finishedAt: new Date('2026-10-10T12:00:00Z'),
  },
];

const ok = () => vi.fn(() => Promise.resolve({ ok: true as const, message: 'ok' }));

function Panel({
  paused,
  actions,
}: {
  paused: boolean;
  actions: {
    publish: ReturnType<typeof ok>;
    resume: ReturnType<typeof ok>;
    rebuild: ReturnType<typeof ok>;
    rollback: ReturnType<typeof ok>;
  };
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
          activity={{ open: null, history: [] }}
          actions={{
            versao: <SiteOperationButton operation="rebuild" />,
            build: <SiteOperationButton operation="publish" />,
            no_ar: <SiteOperationButton operation="rollback" />,
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
] as const;

describe('ações nas etapas no navegador', () => {
  it.each(CASES)(
    '"$button": Esc não roda e devolve o foco; confirmar roda e devolve o foco',
    async ({ operation, button, dialog, confirm, paused }) => {
      const warnings = appElementWarnings();
      const actions = { publish: ok(), resume: ok(), rebuild: ok(), rollback: ok() };
      await renderInApp(<Panel paused={paused} actions={actions} />);
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
