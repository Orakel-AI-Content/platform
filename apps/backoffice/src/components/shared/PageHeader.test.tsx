// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import Link from 'next/link';
import { afterEach, describe, expect, it } from 'vitest';

import { PageHeader } from './PageHeader.tsx';
import { sitesTrail, siteTrail } from './trail.ts';

// Trilha das telas de site e de área (#173): Sites › Site › Área, links até a tela atual; e a
// das telas fora de um site (#307): Sites › <itens>.

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

  it('classes do Ecme, sem as do shadcn: links como título, atual e separador como o body (#243)', () => {
    render(<PageHeader id="t" trail={siteTrail(site, 'Mídia')} title="Mídia" />);

    const nav = screen.getByRole('navigation', { name: 'Trilha de navegação' });
    const classes = [...nav.querySelectorAll('*')].map(
      (element) => element.getAttribute('class') ?? '',
    );
    for (const shadcn of ['text-muted-foreground', 'bg-muted', 'text-foreground']) {
      expect(classes.some((value) => value.split(' ').includes(shadcn))).toBe(false);
    }
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.className).toContain('text-gray-900');
      expect(link.className).toContain('dark:text-gray-100');
    }
    const body = 'text-gray-600 dark:text-gray-400';
    expect(nav.querySelector('[aria-current="page"]')?.className).toBe(body);
    for (const separator of nav.querySelectorAll('[aria-hidden="true"]')) {
      expect(separator.className).toBe(body);
    }
  });

  it('título do Ecme, sem as classes do shadcn; a ação fica ao lado (#247)', () => {
    render(
      <PageHeader
        id="authors-title"
        trail={siteTrail(site, 'Autores')}
        title="Autores"
        action={<Link href="/sites/exemplo-a/autores/novo">Criar autor</Link>}
      />,
    );

    const heading = screen.getByRole('heading', { level: 1, name: 'Autores' });
    expect(heading.id).toBe('authors-title');
    expect(heading.className).toContain('text-gray-900');
    expect(heading.className).toContain('dark:text-gray-100');
    const classes = [...document.body.querySelectorAll('*')].flatMap((element) =>
      (element.getAttribute('class') ?? '').split(' '),
    );
    for (const shadcn of ['text-muted-foreground', 'text-foreground', 'border-border']) {
      expect(classes).not.toContain(shadcn);
    }
    expect(screen.getByRole('link', { name: 'Criar autor' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/autores/novo',
    );
  });

  it('a trilha vem antes do título; sem trilha, só o título', () => {
    render(<PageHeader id="t" trail={siteTrail(site, 'Menus')} title="Menus" />);
    const nav = screen.getByRole('navigation');
    const heading = screen.getByRole('heading', { level: 1, name: 'Menus' });
    expect(nav.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();

    render(<PageHeader id="t" title="Sites" />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('siteTrail nas telas de item (#174)', () => {
  it('com itens, a área vira link para a lista e os itens vêm depois', () => {
    expect(
      siteTrail(site, { label: 'Conteúdos', segment: 'conteudos' }, [
        { label: 'Guia', href: '/sites/exemplo-a/conteudos/7' },
        { label: 'Versão 2' },
      ]),
    ).toEqual([
      { label: 'Sites', href: '/sites' },
      { label: 'Exemplo A — Guias', href: '/sites/exemplo-a' },
      { label: 'Conteúdos', href: '/sites/exemplo-a/conteudos' },
      { label: 'Guia', href: '/sites/exemplo-a/conteudos/7' },
      { label: 'Versão 2' },
    ]);
  });

  it('sem itens, a área é a tela atual, como nas telas de área', () => {
    expect(siteTrail(site, { label: 'Mídia', segment: 'midia' })).toEqual(siteTrail(site, 'Mídia'));
  });

  it('a última camada do item tem aria-current; as anteriores são links', () => {
    render(
      <PageHeader
        id="t"
        trail={siteTrail(site, { label: 'Autores', segment: 'autores' }, [{ label: 'Ana' }])}
        title="Editar “Ana”"
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Trilha de navegação' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/sites', '/sites/exemplo-a', '/sites/exemplo-a/autores']);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe('Ana');
  });
});

describe('sitesTrail nas telas fora de um site (#307)', () => {
  it('sem itens, Sites é a tela atual', () => {
    expect(sitesTrail()).toEqual([{ label: 'Sites' }]);
    expect(sitesTrail([])).toEqual([{ label: 'Sites' }]);
  });

  it('com itens, Sites vira link e os itens vêm depois', () => {
    expect(sitesTrail([{ label: 'Cadastrar site' }])).toEqual([
      { label: 'Sites', href: '/sites' },
      { label: 'Cadastrar site' },
    ]);
  });

  it('no cabeçalho: Sites é link e o item é a tela atual', () => {
    render(
      <PageHeader
        id="t"
        trail={sitesTrail([{ label: 'Cadastrar site' }])}
        title="Cadastrar site"
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Trilha de navegação' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([['Sites', '/sites']]);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe('Cadastrar site');
  });

  it('sem itens no cabeçalho, Sites leva aria-current e não é link', () => {
    render(<PageHeader id="t" trail={sitesTrail()} title="Sites" />);

    const nav = screen.getByRole('navigation', { name: 'Trilha de navegação' });
    expect(within(nav).queryAllByRole('link')).toHaveLength(0);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe('Sites');
  });
});
