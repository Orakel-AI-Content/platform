import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { MediaShowcase } from '@/app/(admin)/teste-de-componentes/media-showcase.tsx';

import {
  audit,
  COLOR_SCHEMES,
  setReducedMotion,
  setTheme,
  tabTo,
} from '../../../test/browser/a11y.ts';
import { expectFocusTrapped } from '../../../test/browser/dialog.ts';
import { renderInApp } from '../../../test/browser/render.tsx';

// MediaPicker em Chromium (#459; da vitrine, #389): o seletor do editor abre por teclado,
// prende o foco, pagina, escolhe, fecha com Esc e devolve o foco a quem abriu. A fixture é a
// seção da própria vitrine, com as páginas numa lista local.

describe.each(COLOR_SCHEMES)('MediaPicker no navegador (%s)', (scheme) => {
  it('abre por teclado, pagina, escolhe, Esc fecha e sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderInApp(<MediaShowcase />);
    const picker = screen.getByRole('region', { name: 'MediaPicker' });

    expect(await audit(picker)).toEqual([]);

    const opener = picker.getByRole('button', { name: 'Escolher imagem' });
    await tabTo(opener);
    await userEvent.keyboard('{Enter}');
    const dialog = page.getByRole('dialog', { name: 'Escolher imagem' });
    const status = dialog.getByRole('status');
    await expect.element(status).toHaveTextContent('Página 1 de 3 · 30 imagens');
    const grid = dialog.getByRole('list', { name: 'Imagens da biblioteca' });
    await expect.poll(() => grid.getByRole('listitem').elements()).toHaveLength(12);
    await expectFocusTrapped(dialog);

    expect(await audit()).toEqual([]);

    await tabTo(dialog.getByRole('button', { name: 'Próxima página' }));
    await userEvent.keyboard('{Enter}');
    await expect.element(status).toHaveTextContent('Página 2 de 3 · 30 imagens');
    await expect
      .element(dialog.getByRole('button', { name: 'Página 2' }))
      .toHaveAttribute('aria-current', 'page');

    const tile = grid.getByRole('button', { name: 'Mídia 13 · 480×320', exact: true });
    await tabTo(tile);
    await userEvent.keyboard('{Enter}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(opener).toHaveFocus();
    await expect.element(picker.getByText('Escolhida: Mídia 13 · 480×320')).toBeVisible();

    await userEvent.keyboard('{Enter}');
    await expect.element(status).toHaveTextContent('Página 1 de 3 · 30 imagens');
    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(opener).toHaveFocus();
  });
});
