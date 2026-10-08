// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sameAreaIn, SiteSwitcher } from './site-switcher.tsx';

// Seletor de site (#172): a lista recebida, o atual marcado e cada link na mesma área do
// outro site. Abrir e fechar (Esc, foco de volta) são do ActionsMenu e do navegador (E2E).

const pathname = vi.hoisted(() => ({ value: '/sites/exemplo-a' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

afterEach(cleanup);

const current = { id: 'exemplo-a', name: 'Exemplo A — Guias' };
const sites = [current, { id: 'exemplo-b', name: 'Exemplo B — Receitas' }];

function renderAt(path: string) {
  pathname.value = path;
  render(<SiteSwitcher current={current} sites={sites} />);
  const button = screen.getByRole('button', { name: 'Exemplo A — Guias, trocar de site' });
  const list = document.getElementById(button.getAttribute('popovertarget') ?? '');
  if (list === null) throw new Error('botão sem lista');
  return { button, links: [...list.querySelectorAll('a')] };
}

describe('seletor de site', () => {
  it('o botão mostra o site atual; a lista tem exatamente os sites recebidos', () => {
    const { button, links } = renderAt('/sites/exemplo-a');

    expect(button.textContent).toBe('Exemplo A — Guias');
    expect(links.map((link) => link.textContent)).toEqual(sites.map((site) => site.name));
  });

  it('só o site atual tem aria-current e destaque', () => {
    const { links } = renderAt('/sites/exemplo-a/midia');

    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual(['true', null]);
    expect(links.map((link) => link.classList.contains('bg-muted'))).toEqual([true, false]);
  });

  it.each([
    ['/sites/exemplo-a', '/sites/exemplo-b'],
    ['/sites/exemplo-a/midia', '/sites/exemplo-b/midia'],
    ['/sites/exemplo-a/autores/5', '/sites/exemplo-b/autores'],
    ['/sites/exemplo-a/autores/novo', '/sites/exemplo-b/autores'],
    ['/sites/exemplo-a/conteudos/7/editar', '/sites/exemplo-b/conteudos'],
    ['/sites/exemplo-a/configuracao', '/sites/exemplo-b/configuracao'],
  ])('em %s, o outro site leva a %s', (path, target) => {
    const { links } = renderAt(path);

    expect(links[1]?.getAttribute('href')).toBe(target);
    expect(sameAreaIn(path, 'exemplo-b')).toBe(target);
  });
});
