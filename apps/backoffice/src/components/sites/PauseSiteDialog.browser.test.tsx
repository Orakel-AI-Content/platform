import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { appElementWarnings, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import { toast } from '@/components/ui/toast';

import {
  SiteOperationButton,
  SiteOperationsAlert,
  SiteOperationsScope,
} from './SiteOperations.tsx';
import { SitePublicationSteps } from './SitePublicationSteps.tsx';

// "Pausar" com motivo em Chromium (#650), aberto pelo botão da linha Site: o motivo vazio não
// confirma e mostra o erro no campo; com motivo, a action roda com ele. Cancelar, Esc e o fundo
// fecham sem efeito e devolvem o foco ao "Pausar".

const NAME = 'Pausar exemplo-a?';

/** O painel como a página monta com operations.run; a action pausa o site, como a revalidação. */
function Panel({ pause }: { pause: (reason: string) => Promise<ActionResult> }) {
  const [reason, setReason] = useState<string | null>(null);
  return (
    <main>
      <SiteOperationsScope
        siteId="exemplo-a"
        paused={reason !== null}
        release="1.2.0"
        timeZone="America/Sao_Paulo"
        pause={async (typed) => {
          const result = await pause(typed);
          if (result.ok) setReason(typed);
          return result;
        }}
        resume={() => Promise.resolve({ ok: true, message: 'ok' })}
      >
        <SitePublicationSteps
          site={{
            lifecycle: 'publicado',
            release: '1.2.0',
            activeVersionId: 'v41',
            state: reason === null ? 'ativo' : 'pausado',
            pausedReason: reason,
            timeZone: 'America/Sao_Paulo',
          }}
          instance={{ activePages: 120, activeSince: null }}
          activity={{ open: null, openInfra: null, history: [] }}
          actions={{
            site: (
              <>
                <SiteOperationButton operation="pause" />
                <SiteOperationButton operation="resume" />
              </>
            ),
          }}
        />
        <SiteOperationsAlert />
      </SiteOperationsScope>
    </main>
  );
}

const ok = () => vi.fn((): Promise<ActionResult> => Promise.resolve({ ok: true, message: 'ok' }));

afterEach(() => {
  toast.removeAll();
  vi.restoreAllMocks();
});

describe('Pausar com motivo no navegador', () => {
  it('motivo vazio mostra o erro no campo; com motivo, roda a action com ele', async () => {
    const pause = ok();
    await renderInApp(<Panel pause={pause} />);
    const dialog = page.getByRole('alertdialog', { name: NAME });
    const field = dialog.getByRole('textbox', { name: /Motivo/ });

    await page.getByRole('button', { name: 'Pausar exemplo-a' }).click();
    await dialog.getByRole('button', { name: 'Pausar', exact: true }).click();
    await expect.element(dialog.getByText('Informe o motivo da pausa')).toBeVisible();
    await expect.element(field).toHaveAttribute('aria-invalid', 'true');
    await expect.element(field).toHaveFocus();
    expect(pause).not.toHaveBeenCalled();

    await field.fill('migração de domínio');
    await dialog.getByRole('button', { name: 'Pausar', exact: true }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.poll(() => pause).toHaveBeenCalledWith('migração de domínio');
    await expect.element(page.getByText('Pausado: migração de domínio')).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Retomar exemplo-a' })).toBeVisible();
  });

  it('Cancelar, Esc e o fundo fecham sem efeito e devolvem o foco ao "Pausar"', async () => {
    const warnings = appElementWarnings();
    const pause = ok();
    await renderInApp(<Panel pause={pause} />);
    const trigger = page.getByRole('button', { name: 'Pausar exemplo-a' });
    const dialog = page.getByRole('alertdialog', { name: NAME });

    (trigger.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(dialog).toBeVisible();
    await expectFocusTrapped(dialog);
    await dialog.getByRole('textbox', { name: /Motivo/ }).fill('qualquer');
    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await expect.element(dialog).toBeVisible();
    const overlay = page.elementLocator(document.querySelector('.dialog-overlay')!);
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();

    expect(pause).not.toHaveBeenCalled();
    expect(warnings()).toEqual([]);
  });
});
