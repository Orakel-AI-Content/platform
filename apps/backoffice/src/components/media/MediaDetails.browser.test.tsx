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

// MediaDetails em Chromium (#459; da vitrine, #389): a miniatura abre os dados da imagem por
// teclado, o diálogo prende o foco e o Esc devolve o foco à miniatura; sem envio registrado,
// o nome e a data de reserva. A fixture é a seção da própria vitrine.

const NAME = 'capa-da-materia-sobre-o-festival-de-inverno-de-2026-na-serra.jpg';

describe.each(COLOR_SCHEMES)('MediaDetails no navegador (%s)', (scheme) => {
  it('a miniatura abre os dados por teclado, Esc devolve o foco e sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderInApp(<MediaShowcase />);
    const details = screen.getByRole('region', { name: 'MediaDetails' });

    expect(await audit(details)).toEqual([]);

    const tile = details.getByRole('button', { name: new RegExp(`^${NAME} · `) });
    await expect.element(tile).toHaveAttribute('aria-haspopup', 'dialog');
    await tabTo(tile);
    await userEvent.keyboard('{Enter}');
    const dialog = page.getByRole('dialog', { name: NAME });
    await expect.element(dialog.getByRole('heading', { name: NAME })).toBeVisible();
    await expect.element(dialog.getByText('1200×800 px')).toBeVisible();
    await expect.element(dialog.getByText('AVIF, JPEG, WebP')).toBeVisible();
    await expectFocusTrapped(dialog);

    expect(await audit()).toEqual([]);

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(tile).toHaveFocus();

    // Sem envio registrado: o nome e a data de reserva.
    const fallback = details.getByRole('button', { name: /^Sem nome \(Mídia 42\) · / });
    await tabTo(fallback);
    await userEvent.keyboard('{Enter}');
    const unnamed = page.getByRole('dialog', { name: 'Sem nome (Mídia 42)' });
    await expect.element(unnamed.getByText('Data de envio não registrada')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect.element(unnamed).not.toBeInTheDocument();
    await expect.element(fallback).toHaveFocus();
  });
});
