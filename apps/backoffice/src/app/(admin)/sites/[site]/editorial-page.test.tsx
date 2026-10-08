// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PageHeader, siteTrail } from './editorial-page.tsx';

// Trilha das telas de site e de área (#173): Sites › Site › Área, links até a tela atual.

afterEach(cleanup);

const site = { id: 'exemplo-a', name: 'Exemplo A — Guias' };

describe('trilha do PageHeader', () => {
  it('na área: Sites e o site são links; a área é a tela atual', () => {
    render(<PageHeader id="t" trail={siteTrail(site, 'Mídia')} title="Mídia" />);

    const nav = screen.getByRole('navigation', { name: 'Trilha de navegação' });
    const items = within(nav).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Sites',
      '›Exemplo A — Guias',
      '›Mídia',
    ]);
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Sites', '/sites'],
      ['Exemplo A — Guias', '/sites/exemplo-a'],
    ]);
    const current = nav.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe('Mídia');
    expect(current?.tagName).toBe('SPAN');
    // O separador não é lido.
    expect(nav.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it('na Visão geral: Sites › <nome>, com o nome como tela atual', () => {
    render(<PageHeader id="t" trail={siteTrail(site)} title={site.name} />);

    const nav = screen.getByRole('navigation', { name: 'Trilha de navegação' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Sites']);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe(site.name);
  });

  it('a trilha vem antes do título; sem trilha nem back, só o título', () => {
    render(<PageHeader id="t" trail={siteTrail(site, 'Menus')} title="Menus" />);
    const nav = screen.getByRole('navigation');
    const heading = screen.getByRole('heading', { level: 1, name: 'Menus' });
    expect(nav.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();

    render(<PageHeader id="t" title="Sites" />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
