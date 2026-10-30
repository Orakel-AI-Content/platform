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
} from '../../../test/browser/a11y.ts';
import { appElementWarnings, appRoot, expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import ConfirmDialog from './ConfirmDialog.tsx';

// ConfirmDialog em Chromium (#458; da vitrine, #209): `alertdialog` com foco preso, Esc fecha e
// o foco volta a quem abriu; aberto sobre o Drawer, fechar só a confirmação mantém a página
// inerte até a gaveta fechar também.

function ConfirmDemo() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <section aria-label="Dialog">
      <Button onClick={() => setDrawerOpen(true)}>Abrir Drawer</Button>
      <Button onClick={() => setConfirmOpen(true)}>Abrir ConfirmDialog</Button>
      <Drawer
        isOpen={drawerOpen}
        title="Filtros"
        onClose={() => setDrawerOpen(false)}
        footer={
          <Button size="sm" variant="solid" onClick={() => setConfirmOpen(true)}>
            Limpar filtros
          </Button>
        }
      >
        <p>Os filtros valem para a lista de artigos.</p>
      </Drawer>
      <ConfirmDialog
        isOpen={confirmOpen}
        type="danger"
        title="Limpar os filtros?"
        confirmText="Limpar"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => setConfirmOpen(false)}
      >
        <p>A lista volta a mostrar todos os artigos.</p>
      </ConfirmDialog>
    </section>
  );
}

const NAME = 'Limpar os filtros?';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConfirmDialog no navegador', () => {
  it('foco preso, página inerte, Esc fecha e o foco volta a "Abrir ConfirmDialog"', async () => {
    const warnings = appElementWarnings();
    const screen = await renderInApp(<ConfirmDemo />);
    const opener = screen.getByRole('button', { name: 'Abrir ConfirmDialog' });

    (opener.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await expect.element(dialog.getByRole('heading', { name: NAME })).toBeVisible();
    expect(appRoot().inert).toBe(true);
    expect(appRoot().getAttribute('aria-hidden')).toBe('true');

    await expectFocusTrapped(dialog);

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(opener).toHaveFocus();
    expect(appRoot().inert).toBe(false);
    expect(warnings()).toEqual([]);
  });

  it('sobre o Drawer: fechar só a confirmação mantém a página inerte', async () => {
    const screen = await renderInApp(<ConfirmDemo />);

    await screen.getByRole('button', { name: 'Abrir Drawer' }).click();
    const drawer = page.getByRole('dialog', { name: 'Filtros' });
    const clear = drawer.getByRole('button', { name: 'Limpar filtros' });
    await clear.click();
    const confirm = page.getByRole('alertdialog', { name: NAME });
    await expect.element(confirm.getByRole('heading', { name: NAME })).toBeVisible();
    await expect
      .element(confirm)
      .toHaveAccessibleDescription('A lista volta a mostrar todos os artigos.');

    await userEvent.keyboard('{Escape}');
    await expect.element(confirm).not.toBeInTheDocument();
    await expect.element(drawer.getByRole('heading', { name: 'Filtros' })).toBeVisible();
    await expect.element(clear).toHaveFocus();
    expect(appRoot().inert).toBe(true);

    await userEvent.keyboard('{Escape}');
    await expect.element(drawer).not.toBeInTheDocument();
    expect(appRoot().inert).toBe(false);
  });
});

describe.each(COLOR_SCHEMES)('ConfirmDialog no navegador (%s)', (scheme) => {
  it('aberto sem violação do axe; o primeiro Tab leva ao Fechar com contorno de 2px', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderInApp(<ConfirmDemo />);

    await screen.getByRole('button', { name: 'Abrir ConfirmDialog' }).click();
    const dialog = page.getByRole('alertdialog', { name: NAME });
    await expect.element(dialog.getByRole('heading', { name: NAME })).toBeVisible();
    expect(await audit()).toEqual([]);

    await userEvent.keyboard('{Tab}');
    const close = dialog.getByRole('button', { name: 'Fechar' });
    await expect.element(close).toHaveFocus();
    expect(outline(close)).toEqual(focusRing());

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
  });
});
