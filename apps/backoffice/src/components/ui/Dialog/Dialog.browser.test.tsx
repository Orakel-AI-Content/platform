import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  focusRing,
  outline,
  setReducedMotion,
  setTheme,
} from '../../../../test/browser/a11y.ts';
import {
  appElementWarnings,
  appRoot,
  expectFocusTrapped,
} from '../../../../test/browser/dialog.ts';
import { renderInApp } from '../../../../test/browser/render.tsx';
import { Button } from '../Button';
import { Dialog } from './index.tsx';

// Dialog em Chromium (#458; da vitrine, #209) sobre o react-modal: foco preso, Esc fecha e o
// foco volta ao botão que abriu; o título nomeia o diálogo; o contêiner da app fica inerte e
// escondido enquanto ele está aberto.

function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Dialog">
      <Button onClick={() => setOpen(true)}>Abrir Dialog</Button>
      <Dialog isOpen={open} title="Editar autor" onClose={() => setOpen(false)}>
        <p className="mb-6">O nome aparece na assinatura dos artigos.</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button size="sm" variant="solid" onClick={() => setOpen(false)}>
            Salvar
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Dialog no navegador', () => {
  it('foco preso, página inerte, Esc fecha e o foco volta a "Abrir Dialog"', async () => {
    const warnings = appElementWarnings();
    const screen = await renderInApp(<DialogDemo />);
    const opener = screen.getByRole('button', { name: 'Abrir Dialog' });

    (opener.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    const dialog = page.getByRole('dialog', { name: 'Editar autor' });
    await expect.element(dialog.getByRole('heading', { name: 'Editar autor' })).toBeVisible();
    expect(appRoot().inert).toBe(true);
    expect(appRoot().getAttribute('aria-hidden')).toBe('true');

    await expectFocusTrapped(dialog);

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(opener).toHaveFocus();
    expect(appRoot().inert).toBe(false);
    expect(warnings()).toEqual([]);
  });
});

describe.each(COLOR_SCHEMES)('Dialog no navegador (%s)', (scheme) => {
  it('aberto sem violação do axe; o primeiro Tab leva ao Fechar com contorno de 2px', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderInApp(<DialogDemo />);

    await screen.getByRole('button', { name: 'Abrir Dialog' }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar autor' });
    await expect.element(dialog.getByRole('heading', { name: 'Editar autor' })).toBeVisible();
    expect(await audit()).toEqual([]);

    await userEvent.keyboard('{Tab}');
    const close = dialog.getByRole('button', { name: 'Fechar' });
    await expect.element(close).toHaveFocus();
    expect(outline(close)).toEqual(focusRing());

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
  });
});
