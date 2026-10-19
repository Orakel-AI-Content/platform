// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import navigationConfig, { filterNavigation } from '@/configs/navigation.config';

import { SideNavProvider } from './SideNavContext.tsx';
import SideNav from './SideNav.tsx';
import SideNavToggle from './SideNavToggle.tsx';

// Recolher a barra (#238): o toggle alterna `aria-expanded` e a largura (290px ↔ 80px); recolhida,
// os itens ficam só com o ícone, com o nome da área no link e a dica no hover e no foco; a marca
// continua "Orakel Backoffice"; o seletor e o rótulo do grupo somem.

const pathname = vi.hoisted(() => ({ value: '/sites/exemplo-a/autores' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

afterEach(cleanup);
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

const SITES = [{ id: 'exemplo-a', name: 'Exemplo A' }];

function renderFrame() {
  render(
    <SideNavProvider>
      <SideNavToggle />
      <SideNav
        navigationTree={filterNavigation(navigationConfig, { email: 'e', roles: ['editor'] })}
        sites={SITES}
      />
    </SideNavProvider>,
  );
  return {
    toggle: screen.getByRole('button', { name: 'Navegação lateral' }),
    bar: () => document.getElementById('barra-lateral')!,
    areas: () => screen.getByRole('navigation', { name: 'Áreas do site' }),
  };
}

describe('SideNavToggle', () => {
  it('alterna aria-expanded e a largura da barra; aria-controls aponta a barra', async () => {
    const user = userEvent.setup();
    const { toggle, bar } = renderFrame();

    expect(toggle.getAttribute('aria-controls')).toBe('barra-lateral');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(bar().style.width).toBe('290px');

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(bar().style.width).toBe('80px');

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(bar().style.width).toBe('290px');
  });

  it('pelo teclado: Enter e Espaço alternam', async () => {
    const user = userEvent.setup();
    const { toggle } = renderFrame();

    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.keyboard(' ');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('SideNav recolhida', () => {
  it('itens só com o ícone, nome da área no link e aria-current no ativo', async () => {
    const user = userEvent.setup();
    const { toggle, areas } = renderFrame();
    await user.click(toggle);

    const autores = within(areas()).getByRole('link', { name: 'Autores' });
    expect(autores.getAttribute('aria-current')).toBe('page');
    expect(autores.querySelector('.sr-only')?.textContent).toBe('Autores');
    expect(autores.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(within(areas()).getAllByRole('link')).toHaveLength(8);
  });

  it('a dica com o nome aparece no hover e no foco, e descreve o link', async () => {
    const user = userEvent.setup();
    const { toggle, areas } = renderFrame();
    await user.click(toggle);
    const midia = within(areas()).getByRole('link', { name: 'Mídia' });

    await user.hover(midia);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Mídia');
    await user.unhover(midia);

    midia.focus();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('Mídia');
    expect(midia.getAttribute('aria-describedby')).toContain(tooltip.id);
  });

  it('a marca continua "Orakel Backoffice"; o seletor vira as iniciais; o rótulo do grupo some e volta', async () => {
    const user = userEvent.setup();
    const { toggle } = renderFrame();
    expect(screen.getByRole('button', { name: /trocar de site/ })).toBeTruthy();
    expect(screen.getByText('Áreas do site', { selector: '.menu-title' })).toBeTruthy();

    await user.click(toggle);
    const brand = screen.getByRole('link', { name: 'Orakel Backoffice' });
    expect(brand.getAttribute('href')).toBe('/sites');
    const switcher = screen.getByRole('button', { name: /trocar de site/ });
    expect(switcher.querySelector('[aria-hidden="true"]')?.textContent).toBe('EA');
    expect(screen.queryByText('Áreas do site', { selector: '.menu-title' })).toBeNull();

    await user.click(toggle);
    expect(screen.getByRole('button', { name: /trocar de site/ })).toBeTruthy();
    expect(screen.getByText('Áreas do site', { selector: '.menu-title' })).toBeTruthy();
  });
});
