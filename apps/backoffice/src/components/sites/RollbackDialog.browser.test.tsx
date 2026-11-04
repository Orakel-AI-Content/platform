import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { appElementWarnings, appRoot, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import { toast } from '@/components/ui/toast';
import type { RollbackVersion } from '@/domain/builds/builds.ts';

import { RollbackDialog } from './RollbackDialog.tsx';

// Reverter em Chromium (#514): foco preso no alertdialog, o foco volta ao gatilho ao fechar
// (Esc, Cancelar e confirmar) e o axe (WCAG 2.2 AA) com o diálogo e o seletor abertos, nos
// dois temas.

const VERSIONS: RollbackVersion[] = [
  {
    versionId: '20261010T120000Z-bbbbbbbb',
    release: 'core-v1.2.0',
    pages: 12,
    finishedAt: new Date('2026-10-10T12:00:00Z'),
  },
  {
    versionId: '20261001T120000Z-abcdef12',
    release: 'core-v1.1.0',
    pages: 10,
    finishedAt: new Date('2026-10-01T12:00:00Z'),
  },
];
const NAME = 'Reverter o site para uma versão anterior?';

function Rollback({ action }: { action: (versionId: string) => Promise<ActionResult> }) {
  return <RollbackDialog versions={VERSIONS} timeZone="America/Sao_Paulo" action={action} />;
}

afterEach(() => {
  toast.removeAll();
  vi.restoreAllMocks();
});

describe('Reverter no navegador', () => {
  it('foco preso; Esc e Cancelar fecham e devolvem o foco ao gatilho', async () => {
    const warnings = appElementWarnings();
    const screen = await renderInApp(<Rollback action={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Reverter' });

    (trigger.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await expect.element(dialog.getByRole('heading', { name: NAME })).toBeVisible();
    expect(appRoot().inert).toBe(true);
    await expectFocusTrapped(dialog);

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
    expect(appRoot().inert).toBe(false);
    expect(warnings()).toEqual([]);
  });

  it('escolher outra versão e confirmar chama a action e devolve o foco ao gatilho', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, message: 'Recusado.' });
    const screen = await renderInApp(<Rollback action={action} />);
    const trigger = screen.getByRole('button', { name: 'Reverter' });

    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await dialog.getByRole('combobox', { name: 'Versão' }).click();
    await page.getByRole('option', { name: /20261001T120000Z-abcdef12/ }).click();
    await expect
      .element(dialog.getByText(/volta para a versão 20261001T120000Z-abcdef12/))
      .toBeVisible();
    await dialog.getByRole('button', { name: 'Reverter', exact: true }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledWith('20261001T120000Z-abcdef12');
    await expect.element(trigger).toHaveFocus();
    await expect.element(page.getByRole('alert')).toHaveTextContent('Recusado.');
  });
});

describe.each(COLOR_SCHEMES)('Reverter no navegador (%s)', (scheme) => {
  it('sem violação do axe com o diálogo e com o seletor abertos', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderInApp(<Rollback action={vi.fn()} />);
    expect(await audit()).toEqual([]);

    await screen.getByRole('button', { name: 'Reverter' }).click();
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await expect.element(dialog.getByRole('heading', { name: NAME })).toBeVisible();
    expect(await audit()).toEqual([]);

    await dialog.getByRole('combobox', { name: 'Versão' }).click();
    await expect.element(page.getByRole('option').first()).toBeVisible();
    expect(await audit()).toEqual([]);

    await userEvent.keyboard('{Escape}{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
  });
});
