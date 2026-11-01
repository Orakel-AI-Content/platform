import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { appElementWarnings, appRoot, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import { toast } from '@/components/ui/toast';

import { ContentActionScope } from './ContentActionScope.tsx';
import { UnpublishDialog, type UnpublishTarget } from './UnpublishDialog.tsx';

// Despublicar em Chromium (#494): foco preso no alertdialog, o foco volta ao gatilho ao
// fechar (Esc, Cancelar e confirmar) e o axe (WCAG 2.2 AA) com o diálogo e o seletor abertos,
// nos dois temas.

const TARGETS: UnpublishTarget[] = [
  { id: 1, title: 'Guia completo', slug: 'guia-completo' },
  { id: 2, title: 'Rotina da manhã', slug: 'rotina-da-manha' },
];
const NAME = 'Despublicar este conteúdo?';

function Unpublish({ action }: { action: (to?: number) => Promise<ActionResult> }) {
  return (
    <ContentActionScope>
      <UnpublishDialog contentId={1} slug="guia-completo" targets={TARGETS} action={action} />
    </ContentActionScope>
  );
}

afterEach(() => {
  toast.removeAll();
  vi.restoreAllMocks();
});

describe('Despublicar no navegador', () => {
  it('foco preso; Esc e Cancelar fecham e devolvem o foco ao gatilho', async () => {
    const warnings = appElementWarnings();
    const screen = await renderInApp(<Unpublish action={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Despublicar' });

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

  it('confirmar pelo teclado, com destino, chama a action e devolve o foco ao gatilho', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, message: 'Recusado.' });
    const screen = await renderInApp(<Unpublish action={action} />);
    const trigger = screen.getByRole('button', { name: 'Despublicar' });

    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await dialog.getByRole('combobox', { name: 'Redirecionar para (opcional)' }).click();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect
      .element(
        dialog.getByText(
          'O conteúdo sai do site no próximo build, e /guia-completo/ passa a redirecionar (301) para /rotina-da-manha/.',
        ),
      )
      .toBeVisible();
    await dialog.getByRole('button', { name: 'Despublicar' }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledWith(2);
    await expect.element(trigger).toHaveFocus();
    await expect.element(page.getByRole('alert')).toHaveTextContent('Recusado.');
  });
});

describe.each(COLOR_SCHEMES)('Despublicar no navegador (%s)', (scheme) => {
  it('sem violação do axe com o diálogo e com o seletor abertos', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderInApp(<Unpublish action={vi.fn()} />);
    expect(await audit()).toEqual([]);

    await screen.getByRole('button', { name: 'Despublicar' }).click();
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await expect.element(dialog.getByRole('heading', { name: NAME })).toBeVisible();
    expect(await audit()).toEqual([]);

    await dialog.getByRole('combobox', { name: 'Redirecionar para (opcional)' }).click();
    await expect.element(page.getByRole('option').first()).toBeVisible();
    expect(await audit()).toEqual([]);

    await userEvent.keyboard('{Escape}{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
  });
});
