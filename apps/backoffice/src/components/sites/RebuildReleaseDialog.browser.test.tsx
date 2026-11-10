import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { appElementWarnings, appRoot, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import { toast } from '@/components/ui/toast';

import { RebuildReleaseDialog } from './RebuildReleaseDialog.tsx';

// Reconstruir na release em Chromium (#515): foco preso no alertdialog, o foco volta ao
// gatilho ao fechar (Esc, Cancelar e confirmar) e o axe (WCAG 2.2 AA) com o diálogo e o
// seletor abertos, nos dois temas.

const RELEASES = ['1.3.0', '1.2.0'];
const NAME = 'Reconstruir o site numa release?';

function Rebuild({ action }: { action: (tag: string) => Promise<ActionResult> }) {
  return <RebuildReleaseDialog current="1.2.0" paused releases={RELEASES} action={action} />;
}

afterEach(() => {
  toast.removeAll();
  vi.restoreAllMocks();
});

describe('Reconstruir na release no navegador', () => {
  it('foco preso; Esc e Cancelar fecham e devolvem o foco ao gatilho', async () => {
    const warnings = appElementWarnings();
    const screen = await renderInApp(<Rebuild action={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Reconstruir na release' });

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

  it('escolher outra release e confirmar chama a action e devolve o foco ao gatilho', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, message: 'Recusado.' });
    const screen = await renderInApp(<Rebuild action={action} />);
    const trigger = screen.getByRole('button', { name: 'Reconstruir na release' });

    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await dialog.getByRole('combobox', { name: 'Release' }).click();
    await page.getByRole('option', { name: '1.3.0' }).click();
    await expect
      .element(
        dialog.getByText(
          'O site passa a usar a imagem site-builder:1.3.0, o build entra na fila já e o site no ar muda. O site sai da pausa.',
        ),
      )
      .toBeVisible();
    await dialog.getByRole('button', { name: 'Reconstruir', exact: true }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledWith('1.3.0');
    await expect.element(trigger).toHaveFocus();
    await expect.element(page.getByRole('alert')).toHaveTextContent('Recusado.');
  });
});

describe.each(COLOR_SCHEMES)('Reconstruir na release no navegador (%s)', (scheme) => {
  it('sem violação do axe com o diálogo e com o seletor abertos', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderInApp(<Rebuild action={vi.fn()} />);
    expect(await audit()).toEqual([]);

    await screen.getByRole('button', { name: 'Reconstruir na release' }).click();
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await expect.element(dialog.getByRole('heading', { name: NAME })).toBeVisible();
    expect(await audit()).toEqual([]);

    await dialog.getByRole('combobox', { name: 'Release' }).click();
    await expect.element(page.getByRole('option').first()).toBeVisible();
    expect(await audit()).toEqual([]);

    await userEvent.keyboard('{Escape}{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
  });
});
