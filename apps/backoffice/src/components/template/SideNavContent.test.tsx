// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import navigationConfig, { filterNavigation } from '@/configs/navigation.config';

import SideNavContent from './SideNavContent.tsx';

// Conteúdo da barra (#242), o mesmo da barra fixa e do Drawer: `nav "Principal"` sempre; o
// seletor e `nav "Áreas do site"` só quando o endereço é de um site que a pessoa vê; o clique
// num item dos dois menus chega a `onMenuItemClick`.

const pathname = vi.hoisted(() => ({ value: '/sites' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

afterEach(cleanup);

const SITES = [
  { id: 'exemplo-a', name: 'Exemplo A' },
  { id: 'exemplo-b', name: 'Exemplo B' },
];

const TREE = filterNavigation(navigationConfig, { email: 'e', roles: ['editor'] });

function renderAt(path: string, onMenuItemClick?: () => void) {
  pathname.value = path;
  render(<SideNavContent navigationTree={TREE} sites={SITES} onMenuItemClick={onMenuItemClick} />);
}

const principal = () => screen.getByRole('navigation', { name: 'Principal' });
const areas = () => screen.queryByRole('navigation', { name: 'Áreas do site' });
const switcher = () => screen.queryByRole('button', { name: /trocar de site/ });

describe('SideNavContent', () => {
  it.each(['/sites', '/sites/novo', '/sites/inexistente/midia', '/conta'])(
    'em %s, só "Principal", sem o seletor nem as áreas',
    (path) => {
      renderAt(path);

      expect(
        within(principal())
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['Sites']);
      expect(areas()).toBeNull();
      expect(switcher()).toBeNull();
    },
  );

  it('dentro de um site visível, o seletor do site e as áreas dele, depois de "Principal"', () => {
    renderAt('/sites/exemplo-b/conteudos');

    const navs = screen.getAllByRole('navigation');
    expect(navs.map((nav) => nav.getAttribute('aria-label'))).toEqual([
      'Principal',
      'Áreas do site',
    ]);
    expect(screen.getByRole('button', { name: 'Exemplo B, trocar de site' })).toBeTruthy();
    expect(within(areas()!).getByRole('link', { name: 'Conteúdos' }).getAttribute('href')).toBe(
      '/sites/exemplo-b/conteudos',
    );
    expect(
      within(areas()!)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page')
        .map((link) => link.textContent),
    ).toEqual(['Conteúdos']);
  });

  it('o clique num item de "Principal" e das áreas chega a onMenuItemClick', async () => {
    const user = userEvent.setup();
    const onMenuItemClick = vi.fn();
    renderAt('/sites/exemplo-a', onMenuItemClick);

    await user.click(within(principal()).getByRole('link', { name: 'Sites' }));
    await user.click(within(areas()!).getByRole('link', { name: 'Mídia' }));

    expect(onMenuItemClick).toHaveBeenCalledTimes(2);
  });
});
