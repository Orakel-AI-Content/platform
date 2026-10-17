// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import navigationConfig, { filterNavigation } from '@/configs/navigation.config';
import type { Actor } from '@/domain/access/rbac.ts';

import SideNav from './SideNav.tsx';

// Barra lateral da moldura (#237; antes, a SiteNav do #171): a marca, `nav "Principal"` e,
// dentro de um site visível, o seletor e `nav "Áreas do site"`, na ordem da árvore, com o item
// atual em aria-current também nas telas de item, criar e editar.

const pathname = vi.hoisted(() => ({ value: '/sites' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

afterEach(cleanup);

const SITES = [
  { id: 'exemplo-a', name: 'Exemplo A' },
  { id: 'exemplo-b', name: 'Exemplo B' },
];

const AREAS = ['Visão geral', 'Conteúdos', 'Revisão', 'Mídia', 'Autores', 'Taxonomias', 'Menus'];

const actor = (role: Actor['roles'][number]): Actor => ({ email: `${role}@x`, roles: [role] });

function renderAt(path: string, role: Actor['roles'][number] = 'operacao') {
  pathname.value = path;
  render(
    <SideNav navigationTree={filterNavigation(navigationConfig, actor(role))} sites={SITES} />,
  );
}

const areas = () => screen.queryByRole('navigation', { name: 'Áreas do site' });
const currentLinks = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page');

describe('SideNav', () => {
  it('a marca leva a /sites; "Principal" tem Sites, atual em /sites e em /sites/novo', () => {
    for (const path of ['/sites', '/sites/novo']) {
      renderAt(path);
      expect(screen.getByRole('link', { name: 'Orakel Backoffice' }).getAttribute('href')).toBe(
        '/sites',
      );
      const principal = screen.getByRole('navigation', { name: 'Principal' });
      expect(currentLinks(principal).map((link) => link.textContent)).toEqual(['Sites']);
      expect(areas()).toBeNull();
      cleanup();
    }
  });

  it('dentro de um site, as áreas na ordem, com o endereço de cada uma', () => {
    renderAt('/sites/exemplo-a');

    const links = within(areas()!).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(AREAS);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/sites/exemplo-a',
      '/sites/exemplo-a/conteudos',
      '/sites/exemplo-a/revisao',
      '/sites/exemplo-a/midia',
      '/sites/exemplo-a/autores',
      '/sites/exemplo-a/taxonomias',
      '/sites/exemplo-a/menus',
    ]);
    expect(screen.getByRole('button', { name: 'Exemplo A, trocar de site' })).toBeTruthy();
  });

  it('com content.write, também "Textos institucionais"', () => {
    renderAt('/sites/exemplo-a/midia', 'editor');

    expect(
      within(areas()!)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([...AREAS, 'Textos institucionais']);
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
  ])('em %s, só "%s" tem aria-current="page" e o destaque do Menu', (path, label) => {
    renderAt(path);

    const current = currentLinks(areas()!);
    expect(current.map((link) => link.textContent)).toEqual([label]);
    expect(current[0]?.closest('li')?.className).toContain('menu-item-active');
    expect(currentLinks(screen.getByRole('navigation', { name: 'Principal' }))).toEqual([]);
  });

  it('área fora da barra (sem permissão para o item) não destaca nenhuma', () => {
    renderAt('/sites/exemplo-a/institucionais');

    expect(currentLinks(areas()!)).toEqual([]);
  });

  it('site que a pessoa não vê (404) não mostra as áreas nem o seletor', () => {
    renderAt('/sites/inexistente/midia');

    expect(areas()).toBeNull();
    expect(screen.queryByRole('button', { name: /trocar de site/ })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy();
  });
});
