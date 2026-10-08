// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SiteNav, type SiteNavItem } from './site-nav.tsx';

// Barra lateral do site (#171): as áreas recebidas, na ordem, e a atual com aria-current.

const pathname = vi.hoisted(() => ({ value: '/sites/exemplo-a' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

afterEach(cleanup);

const items: SiteNavItem[] = [
  { segment: '', label: 'Visão geral' },
  { segment: 'conteudos', label: 'Conteúdos' },
  { segment: 'revisao', label: 'Revisão' },
  { segment: 'midia', label: 'Mídia' },
  { segment: 'autores', label: 'Autores' },
  { segment: 'taxonomias', label: 'Taxonomias' },
  { segment: 'menus', label: 'Menus' },
];

function renderAt(path: string) {
  pathname.value = path;
  render(<SiteNav siteId="exemplo-a" items={items} />);
  return within(screen.getByRole('navigation', { name: 'Áreas do site' }));
}

const currentLinks = (nav: ReturnType<typeof renderAt>) =>
  nav.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');

describe('barra lateral do site', () => {
  it('lista as áreas recebidas, na ordem, com o endereço de cada uma', () => {
    const nav = renderAt('/sites/exemplo-a');

    const links = nav.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(items.map((item) => item.label));
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/sites/exemplo-a',
      '/sites/exemplo-a/conteudos',
      '/sites/exemplo-a/revisao',
      '/sites/exemplo-a/midia',
      '/sites/exemplo-a/autores',
      '/sites/exemplo-a/taxonomias',
      '/sites/exemplo-a/menus',
    ]);
  });

  it.each([
    ['/sites/exemplo-a', 'Visão geral'],
    ['/sites/exemplo-a/conteudos', 'Conteúdos'],
    ['/sites/exemplo-a/autores/5', 'Autores'],
    ['/sites/exemplo-a/autores/novo', 'Autores'],
    ['/sites/exemplo-a/conteudos/7/editar', 'Conteúdos'],
    ['/sites/exemplo-a/revisao/3', 'Revisão'],
    ['/sites/exemplo-a/configuracao', 'Visão geral'],
    ['/sites/exemplo-a/pendencias', 'Visão geral'],
  ])('em %s, só "%s" tem aria-current="page" e o destaque', (path, label) => {
    const nav = renderAt(path);

    const current = currentLinks(nav);
    expect(current.map((link) => link.textContent)).toEqual([label]);
    expect(current[0]?.classList.contains('bg-muted')).toBe(true);
    for (const link of nav.getAllByRole('link')) {
      if (link !== current[0]) expect(link.classList.contains('bg-muted')).toBe(false);
    }
  });

  it('área fora da barra (sem permissão para o item) não destaca nenhum', () => {
    const nav = renderAt('/sites/exemplo-a/institucionais');

    expect(currentLinks(nav)).toEqual([]);
  });
});
