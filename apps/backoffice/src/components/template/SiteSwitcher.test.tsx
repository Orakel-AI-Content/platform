// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { sameAreaIn, SiteSwitcher, siteInitials } from './SiteSwitcher.tsx';

// Seletor de site (#172, #241): o Dropdown com os sites recebidos, o atual marcado e cada item
// na mesma área do outro site; abre pelo teclado e Esc devolve o foco. Recolhida, as iniciais
// com o mesmo nome e a dica.

const pathname = vi.hoisted(() => ({ value: '/sites/exemplo-a' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

afterEach(cleanup);
// A dica (recolhida) anima com o motion, que o happy-dom cancela no `cleanup`.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

const current = { id: 'exemplo-a', name: 'Exemplo A — Guias' };
const sites = [current, { id: 'exemplo-b', name: 'Exemplo B — Receitas' }];
const NAME = 'Exemplo A — Guias, trocar de site';

async function openAt(path: string, collapsed = false) {
  pathname.value = path;
  const user = userEvent.setup();
  render(<SiteSwitcher current={current} sites={sites} collapsed={collapsed} />);
  const button = screen.getByRole('button', { name: NAME });
  button.focus();
  await user.keyboard('{Enter}');
  const menu = await screen.findByRole('menu');
  return { user, button, menu, items: within(menu).getAllByRole('menuitem') };
}

describe('seletor de site', () => {
  it('o botão mostra o site atual; o menu tem exatamente os sites recebidos, em links', async () => {
    const { button, items } = await openAt('/sites/exemplo-a');

    expect(button.querySelector('[aria-hidden="true"]')?.textContent).toBe('Exemplo A — Guias');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(items.map((item) => item.textContent)).toEqual(sites.map((site) => site.name));
    expect(items.map((item) => item.tagName)).toEqual(['A', 'A']);
  });

  it('só o site atual tem aria-current e o destaque', async () => {
    const { items } = await openAt('/sites/exemplo-a/midia');

    expect(items.map((item) => item.getAttribute('aria-current'))).toEqual(['true', null]);
    expect(items.map((item) => item.classList.contains('menu-item-active'))).toEqual([true, false]);
  });

  it.each([
    ['/sites/exemplo-a', '/sites/exemplo-b'],
    ['/sites/exemplo-a/midia', '/sites/exemplo-b/midia'],
    ['/sites/exemplo-a/autores/5', '/sites/exemplo-b/autores'],
    ['/sites/exemplo-a/autores/novo', '/sites/exemplo-b/autores'],
    ['/sites/exemplo-a/conteudos/7/editar', '/sites/exemplo-b/conteudos'],
    ['/sites/exemplo-a/configuracao', '/sites/exemplo-b/configuracao'],
  ])('em %s, o outro site leva a %s', async (path, target) => {
    const { items } = await openAt(path);

    expect(items[1]?.getAttribute('href')).toBe(target);
    expect(sameAreaIn(path, 'exemplo-b')).toBe(target);
  });

  it('as setas percorrem os sites; Esc fecha e devolve o foco ao botão', async () => {
    const { user, button, items } = await openAt('/sites/exemplo-a');

    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).toBe(items[1]));

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it('recolhida: as iniciais, o mesmo nome e a dica com o nome do site', async () => {
    pathname.value = '/sites/exemplo-a';
    const user = userEvent.setup();
    render(<SiteSwitcher current={current} sites={sites} collapsed />);
    const button = screen.getByRole('button', { name: NAME });

    expect(button.querySelector('[aria-hidden="true"]')?.textContent).toBe('EA');
    await user.hover(button);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('Exemplo A — Guias');
    expect(button.getAttribute('aria-describedby')).toContain(tooltip.id);

    await user.unhover(button);
    button.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
  });
});

describe('iniciais do site', () => {
  it.each([
    ['Exemplo A — Guias', 'EA'],
    ['Receitas', 'R'],
    ['ética — de bolso', 'ÉD'],
    ['  — Blog   de viagem', 'BD'],
  ])('%s → %s', (name, initials) => {
    expect(siteInitials(name)).toBe(initials);
  });
});
