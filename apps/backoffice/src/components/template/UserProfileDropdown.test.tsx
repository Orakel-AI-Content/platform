// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dropdown } from '@/components/ui/Dropdown';

import UserProfileDropdown, { LOGOUT_PATH } from './UserProfileDropdown.tsx';

// Menu de perfil (#239): gatilho com o e-mail e os papéis no nome (e no texto, para o banner),
// menu com o cabeçalho e "Sair" como link para o Access; Esc fecha e devolve o foco ao gatilho.
// O item em link do Dropdown navega com Enter e Espaço (clique nativo).

afterEach(cleanup);

const renderMenu = () =>
  render(
    <header>
      <UserProfileDropdown email="editor@orakel.local" roles={['editor', 'revisor']} />
    </header>,
  );

const toggle = () =>
  screen.getByRole('button', { name: 'Perfil de editor@orakel.local · editor, revisor' });

describe('UserProfileDropdown', () => {
  it('gatilho com nome acessível; o banner tem o e-mail e os papéis com o menu fechado', () => {
    renderMenu();

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('banner').textContent).toContain(
      'editor@orakel.local · editor, revisor',
    );
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('abre com Enter e com Espaço, mostra o e-mail e os papéis, e Esc devolve o foco', async () => {
    const user = userEvent.setup();
    renderMenu();

    for (const key of ['{Enter}', ' ']) {
      toggle().focus();
      await user.keyboard(key);
      const menu = await screen.findByRole('menu');
      expect(within(menu).getByText('editor@orakel.local')).toBeTruthy();
      expect(within(menu).getByText('editor, revisor')).toBeTruthy();

      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      expect(document.activeElement).toBe(toggle());
    }
  });

  it('"Sair" é um <a role="menuitem"> para a rota do Access, alcançável pelas setas', async () => {
    const user = userEvent.setup();
    renderMenu();

    toggle().focus();
    await user.keyboard('{Enter}');
    const sair = await screen.findByRole('menuitem', { name: 'Sair' });
    expect(sair.tagName).toBe('A');
    expect(sair.getAttribute('href')).toBe(LOGOUT_PATH);
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem')).toEqual([sair]);

    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).toBe(sair));
  });
});

describe('item do Dropdown em link (#239)', () => {
  it('Enter e Espaço disparam o clique nativo do <a>; o item comum segue com onSelect', async () => {
    const user = userEvent.setup();
    const onLinkClick = vi.fn((event: MouseEvent) => event.preventDefault());
    const onSelect = vi.fn();
    render(
      <Dropdown title="Ações">
        <Dropdown.Item eventKey="editar" onSelect={onSelect}>
          Editar
        </Dropdown.Item>
        <Dropdown.Item asElement="a" href="/destino" eventKey="ir" onSelect={onSelect}>
          Ir
        </Dropdown.Item>
      </Dropdown>,
    );
    document.addEventListener('click', onLinkClick);

    for (const key of ['{Enter}', ' ']) {
      screen.getByRole('button', { name: 'Ações' }).focus();
      await user.keyboard('{Enter}');
      const link = await screen.findByRole('menuitem', { name: 'Ir' });
      link.focus();
      await user.keyboard(key);
      expect(onLinkClick).toHaveBeenCalled();
      expect((onLinkClick.mock.lastCall?.[0].target as HTMLElement).tagName).toBe('A');
      expect(onSelect).toHaveBeenLastCalledWith('ir', expect.anything());
      onLinkClick.mockClear();
    }

    document.removeEventListener('click', onLinkClick);
  });
});
