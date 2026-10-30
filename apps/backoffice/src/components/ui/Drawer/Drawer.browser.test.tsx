import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  focusRing,
  outline,
  REDUCED_MOTIONS,
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
import { Drawer } from './index.tsx';

// Drawer em Chromium (#458; da vitrine, #209) sobre o react-modal: foco preso, Esc fecha e o
// foco volta ao botão que abriu, o contêiner da app fica inerte, e com movimento reduzido a
// gaveta entra sem transição.

function DrawerDemo() {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Drawer">
      <Button onClick={() => setOpen(true)}>Abrir Drawer</Button>
      <Drawer
        isOpen={open}
        title="Filtros"
        onClose={() => setOpen(false)}
        footer={
          <Button size="sm" variant="solid">
            Limpar filtros
          </Button>
        }
      >
        <p>Os filtros valem para a lista de artigos.</p>
      </Drawer>
    </section>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Drawer no navegador', () => {
  it('foco preso, página inerte, Esc fecha e o foco volta a "Abrir Drawer"', async () => {
    const warnings = appElementWarnings();
    const screen = await renderInApp(<DrawerDemo />);
    const opener = screen.getByRole('button', { name: 'Abrir Drawer' });

    (opener.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    const dialog = page.getByRole('dialog', { name: 'Filtros' });
    // O elemento do react-modal não tem caixa própria no Drawer (o conteúdo é absoluto dentro do
    // overlay, como no Ecme): a visibilidade é a do título.
    await expect.element(dialog.getByRole('heading', { name: 'Filtros' })).toBeVisible();
    expect(appRoot().inert).toBe(true);
    expect(appRoot().getAttribute('aria-hidden')).toBe('true');

    await expectFocusTrapped(dialog);

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(opener).toHaveFocus();
    expect(appRoot().inert).toBe(false);
    expect(warnings()).toEqual([]);
  });

  it.each(REDUCED_MOTIONS)(
    'abre com ou sem transição conforme reducedMotion %s',
    async (motion) => {
      await setReducedMotion(motion);
      const screen = await renderInApp(<DrawerDemo />);

      // A posição `right` da gaveta a cada quadro, do momento em que ela entra no DOM até 500 ms
      // depois (a transição padrão do motion leva cerca de 300 ms), e a transição do overlay.
      const sampled = new Promise<{ positions: number[]; overlayTransition: string }>((resolve) => {
        const values: number[] = [];
        const observer = new MutationObserver(() => {
          const content = document.querySelector<HTMLElement>('.drawer-content');
          if (!content) return;
          observer.disconnect();
          const start = performance.now();
          const sample = () => {
            values.push(parseFloat(getComputedStyle(content).right));
            if (performance.now() - start < 500) requestAnimationFrame(sample);
            else
              resolve({
                positions: values,
                overlayTransition: getComputedStyle(document.querySelector('.drawer-overlay')!)
                  .transitionDuration,
              });
          };
          requestAnimationFrame(sample);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
      (screen.getByRole('button', { name: 'Abrir Drawer' }).element() as HTMLElement).click();
      const { positions, overlayTransition } = await sampled;

      expect(positions.at(-1)).toBe(0);
      const intermediate = positions.filter((value) => value < 0 && value > -400);
      if (motion === 'reduce') {
        expect(positions[0]).toBe(0);
        expect(intermediate).toEqual([]);
        expect(overlayTransition).toBe('0s');
      } else {
        expect(intermediate.length).toBeGreaterThan(0);
      }
    },
  );
});

describe.each(COLOR_SCHEMES)('Drawer no navegador (%s)', (scheme) => {
  it('aberto sem violação do axe; o primeiro Tab leva ao Fechar com contorno de 2px', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderInApp(<DrawerDemo />);

    await screen.getByRole('button', { name: 'Abrir Drawer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Filtros' });
    await expect.element(dialog.getByRole('heading', { name: 'Filtros' })).toBeVisible();
    expect(await audit()).toEqual([]);

    await userEvent.keyboard('{Tab}');
    const close = dialog.getByRole('button', { name: 'Fechar' });
    await expect.element(close).toHaveFocus();
    expect(outline(close)).toEqual(focusRing());

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
  });
});
