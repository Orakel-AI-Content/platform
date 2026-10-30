import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import { MenuShowcase } from '@/app/(admin)/teste-de-componentes/menu-showcase.tsx';

import {
  audit,
  COLOR_SCHEMES,
  focusRing,
  outline,
  setReducedMotion,
  setTheme,
  tabTo,
  targetSize,
} from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';

// Menu e NavToggle em Chromium (#459; da vitrine, #235): nav nomeado com o grupo como lista
// nomeada pelo rótulo, link do item ativo com aria-current, foco de 2px no --ring nos links e no
// botão do NavToggle, que recolhe o menu (aria-expanded, rótulo do grupo escondido) pelo Enter.
// A fixture é a seção da própria vitrine.

describe('Menu no navegador', () => {
  it('nav nomeado, grupo em lista com rótulo e item ativo com aria-current', async () => {
    const screen = await renderUi(<MenuShowcase />);
    const nav = screen.getByRole('navigation', { name: 'Menu de exemplo' });
    const list = nav.getByRole('list', { name: 'Áreas do site' });

    expect(list.getByRole('listitem').elements()).toHaveLength(3);
    await expect
      .element(nav.getByRole('link', { name: 'Conteúdos' }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(nav.getByRole('link', { name: 'Mídia' }))
      .not.toHaveAttribute('aria-current');
    expect(nav.element().querySelector('.menu-item-active')?.textContent).toBe('Conteúdos');
  });
});

describe.each(COLOR_SCHEMES)('Menu e NavToggle no navegador (%s)', (scheme) => {
  it('foco de 2px, recolher por Enter e sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderUi(<MenuShowcase />);
    const toggle = screen.getByRole('button', { name: 'Alternar o menu de exemplo' });
    const link = screen.getByRole('link', { name: 'Visão geral' });

    await tabTo(toggle);
    expect(outline(toggle)).toEqual(focusRing());
    const { width, height } = targetSize(toggle);
    expect(width).toBeGreaterThanOrEqual(24);
    expect(height).toBeGreaterThanOrEqual(24);

    await tabTo(link);
    expect(outline(link)).toEqual(focusRing());
    expect(await audit(screen.container)).toEqual([]);

    await expect.element(toggle).toHaveAttribute('aria-expanded', 'true');
    const icon = toggle.element().querySelector('svg')!.innerHTML;
    (toggle.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.element().querySelector('svg')!.innerHTML).not.toBe(icon);
    await expect
      .element(screen.getByText('Áreas do site', { exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('link', { name: 'Conteúdos' }))
      .toHaveAttribute('aria-current', 'page');
    expect(await audit(screen.container)).toEqual([]);
  });
});
