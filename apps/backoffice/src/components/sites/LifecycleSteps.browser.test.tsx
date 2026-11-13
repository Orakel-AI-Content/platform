import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { renderInApp } from '../../../test/browser/render.tsx';
import type { SiteActivity } from '@/domain/builds/builds.ts';
import type { SiteInfraCheck } from '@/domain/sites/sites.ts';

import type { InfraCheckView } from './LifecycleSteps.tsx';
import { LifecycleAction } from './SiteActions.tsx';
import { SitePublicationTab } from './SitePublicationTab.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// "Conferir agora" na etapa Infra e zona em Chromium (workspace#85): pelo teclado, pede a
// conferência uma vez; enquanto ela está na fila, o botão diz "Conferindo…" e o foco fica nele
// (aria-disabled, não disabled); com o resultado, o botão volta e o foco continua nele. Só
// comportamento, sem axe (ADR 0020).

const POLL_MS = 50;
const IDLE: SiteActivity = { open: null, openInfra: null, history: [] };
const CHECK: SiteInfraCheck = {
  lifecycle: 'cadastrado',
  checkedAt: null,
  error: null,
  queued: false,
};

/** A aba, com a revalidação da página simulada: "Conferir agora" devolve a conferência na fila. */
function Tab({
  request,
  status,
}: {
  request: () => void;
  status: () => Promise<SiteInfraCheck | null>;
}) {
  const [view, setView] = useState<InfraCheckView>({ check: CHECK, now: new Date() });
  return (
    <SitePublicationTab
      site={{
        lifecycle: 'cadastrado',
        release: null,
        activeVersionId: null,
        state: 'promovendo',
        pausedReason: null,
        timeZone: 'America/Sao_Paulo',
      }}
      instance={{ activePages: null, activeSince: null }}
      activity={IDLE}
      status={() => Promise.resolve(IDLE)}
      infraCheck={view}
      infraCheckStatus={status}
      pollMs={POLL_MS}
      lifecycleAction={
        <LifecycleAction
          lifecycle="cadastrado"
          check={() => {
            request();
            setView({ check: { ...CHECK, queued: true }, now: new Date() });
            return Promise.resolve({ ok: true, message: 'Conferência da infra enfileirada.' });
          }}
          undo={() => Promise.resolve({ ok: true, message: '' })}
        />
      }
    />
  );
}

describe('"Conferir agora" (#716)', () => {
  it('pelo teclado, pede uma vez e o foco fica no botão da fila ao resultado', async () => {
    const request = vi.fn();
    let finish: (check: SiteInfraCheck) => void = () => undefined;
    const done = new Promise<SiteInfraCheck>((resolve) => {
      finish = resolve;
    });
    const status = vi
      .fn<() => Promise<SiteInfraCheck | null>>()
      .mockImplementation(() => Promise.resolve({ ...CHECK, queued: true }));
    await renderInApp(<Tab request={request} status={status} />);

    const button = page.getByRole('button', { name: 'Conferir agora' });
    await expect.element(button).toBeVisible();
    (button.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');

    const pending = page.getByRole('button', { name: 'Conferindo…' });
    await expect.element(pending).toHaveAttribute('aria-disabled', 'true');
    await expect.element(pending).toHaveFocus();
    await expect.element(page.getByRole('status').first()).toHaveTextContent('Conferindo…');
    expect(request).toHaveBeenCalledTimes(1);

    // Na fila, Enter de novo não pede outra conferência.
    await userEvent.keyboard('{Enter}');
    expect(request).toHaveBeenCalledTimes(1);

    status.mockImplementation(() => done);
    finish({ ...CHECK, checkedAt: new Date() });

    const back = page.getByRole('button', { name: 'Conferir agora' });
    await expect.element(back).toBeVisible();
    await expect.element(back).toHaveFocus();
    await expect
      .element(page.getByText('Zona não encontrada no provedor (conferido há menos de 1 minuto)'))
      .toBeVisible();
  });
});
