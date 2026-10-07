// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import Link from 'next/link';
import { afterEach, describe, expect, it } from 'vitest';

import { ActionsMenu } from './actions-menu.tsx';

// Menu "Mais ações" (#98): nome acessível e ligação botão → lista. Abrir, fechar e Esc são do
// navegador (Popover API), que o happy-dom não implementa; o E2E da tabela de sites (#100)
// os verifica.

afterEach(cleanup);

function menuOf(button: HTMLElement): HTMLElement {
  const target = button.getAttribute('popovertarget');
  const list = target === null ? null : document.getElementById(target);
  if (list === null) throw new Error('botão sem lista ligada');
  return list;
}

describe('menu Mais ações', () => {
  it('sem label, o nome acessível é o texto do botão', () => {
    render(
      <ActionsMenu>
        <button type="button">Publicar</button>
      </ActionsMenu>,
    );

    expect(screen.getByRole('button', { name: 'Mais ações' })).toBeTruthy();
  });

  it('com label, o nome acessível inclui o item da linha', () => {
    render(
      <ActionsMenu label="exemplo-a">
        <button type="button">Publicar</button>
      </ActionsMenu>,
    );

    expect(screen.getByRole('button', { name: 'Mais ações: exemplo-a' })).toBeTruthy();
  });

  it('o botão aponta para a lista popover, que tem os links e botões recebidos', () => {
    render(
      <ActionsMenu label="exemplo-a">
        <Link href="/sites/exemplo-a/conteudos">Conteúdos</Link>
        <button type="button">Remover</button>
      </ActionsMenu>,
    );

    const list = menuOf(screen.getByRole('button', { name: 'Mais ações: exemplo-a' }));
    expect(list.getAttribute('popover')).toBe('auto');
    expect(list.querySelector('a')?.getAttribute('href')).toBe('/sites/exemplo-a/conteudos');
    expect(list.querySelector('a')?.textContent).toBe('Conteúdos');
    expect(list.querySelector('button')?.textContent).toBe('Remover');
  });

  it('dois menus na mesma tela apontam para listas diferentes', () => {
    render(
      <>
        <ActionsMenu label="exemplo-a">
          <button type="button">A</button>
        </ActionsMenu>
        <ActionsMenu label="exemplo-b">
          <button type="button">B</button>
        </ActionsMenu>
      </>,
    );

    const a = menuOf(screen.getByRole('button', { name: 'Mais ações: exemplo-a' }));
    const b = menuOf(screen.getByRole('button', { name: 'Mais ações: exemplo-b' }));
    expect(a.id).not.toBe(b.id);
    expect(a.textContent).toBe('A');
    expect(b.textContent).toBe('B');
  });
});
