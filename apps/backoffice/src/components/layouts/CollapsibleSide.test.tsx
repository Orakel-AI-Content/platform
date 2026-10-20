// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SIDE_NAV_ID } from '@/components/template/SideNavContext';
import navigationConfig, { filterNavigation } from '@/configs/navigation.config';

import CollapsibleSide from './CollapsibleSide.tsx';

// Moldura do Backoffice (#237, #242): a barra lateral com `nav "Principal"`, o header (banner)
// com o botão do celular e o toggle de recolher no início e `headerEnd` no fim, e o conteúdo.
// Abaixo de `lg`, a barra e o toggle somem e fica o botão do Drawer; o happy-dom não aplica
// media queries, então a troca é conferida pelas classes.

const pathname = vi.hoisted(() => ({ value: '/sites/exemplo-a' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

afterEach(cleanup);

const SITES = [{ id: 'exemplo-a', name: 'Exemplo A' }];

function renderFrame() {
  render(
    <CollapsibleSide
      navigationTree={filterNavigation(navigationConfig, { email: 'e', roles: ['editor'] })}
      sites={SITES}
      headerEnd={<button type="button">Sair</button>}
    >
      <main>Conteúdo da página</main>
    </CollapsibleSide>,
  );
}

// A barra é o contêiner de `nav "Principal"` apontado pelo `aria-controls` do toggle.
const sideNav = () =>
  screen.getByRole('navigation', { name: 'Principal' }).closest<HTMLElement>(`#${SIDE_NAV_ID}`);

describe('CollapsibleSide', () => {
  it('a barra lateral, o header e o conteúdo', () => {
    renderFrame();

    expect(sideNav()).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Áreas do site' })).toBeTruthy();
    expect(screen.getByRole('main').textContent).toBe('Conteúdo da página');
  });

  it('o header tem o botão do celular e o toggle no início e headerEnd no fim', () => {
    renderFrame();

    expect(
      within(screen.getByRole('banner'))
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') ?? button.textContent),
    ).toEqual(['Menu de navegação', 'Navegação lateral', 'Sair']);
  });

  it('o toggle começa expandido e controla a barra', () => {
    renderFrame();

    const toggle = screen.getByRole('button', { name: 'Navegação lateral' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe(sideNav()?.id);
  });

  it('abaixo de lg, a barra e o toggle ficam ocultos e o botão do celular aparece', () => {
    renderFrame();

    expect(sideNav()?.className).toContain('hidden lg:flex');
    expect(screen.getByRole('button', { name: 'Navegação lateral' }).className).toContain(
      'hidden lg:flex',
    );
    expect(screen.getByRole('button', { name: 'Menu de navegação' }).className).toContain(
      'lg:hidden',
    );
  });
});
