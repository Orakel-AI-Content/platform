// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import NavToggle from '@/components/shared/NavToggle';

import { Menu } from './index.tsx';

// Menu do Ecme (#235): <nav> nomeado, grupo como lista nomeada pelo rótulo, item ativo por
// `defaultActiveKeys`, `onSelect` com o `eventKey` e o rótulo escondido com `sideCollapsed`.
// O NavToggle troca o ícone pelo `toggled`, sempre decorativo.

afterEach(cleanup);

function renderMenu(props: Partial<Parameters<typeof Menu>[0]> = {}) {
  return render(
    <Menu aria-label="Áreas do site" defaultActiveKeys={['conteudos']} {...props}>
      <Menu.MenuGroup label="Site">
        <Menu.MenuItem eventKey="visao-geral">Visão geral</Menu.MenuItem>
        <Menu.MenuItem eventKey="conteudos">Conteúdos</Menu.MenuItem>
      </Menu.MenuGroup>
    </Menu>,
  );
}

describe('Menu', () => {
  it('nav nomeado; grupo é uma lista nomeada pelo rótulo, com os itens em <li>', () => {
    renderMenu();

    const nav = screen.getByRole('navigation', { name: 'Áreas do site' });
    expect(nav.className).toBe('menu');
    const list = within(nav).getByRole('list', { name: 'Site' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Visão geral', 'Conteúdos']);
    expect(screen.getByText('Site').className).toBe('menu-title');
  });

  it('o item de defaultActiveKeys fica ativo; os outros, não', () => {
    renderMenu();

    expect(screen.getByText('Conteúdos').className).toContain('menu-item-active');
    expect(screen.getByText('Visão geral').className).not.toContain('menu-item-active');
  });

  it('onSelect recebe o eventKey do item clicado', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderMenu({ onSelect });

    await user.click(screen.getByText('Visão geral'));
    expect(onSelect).toHaveBeenCalledWith('visao-geral', expect.anything());
  });

  it('menuItemHeight vai para a altura de cada item (48px por padrão, como no Ecme)', () => {
    const { unmount } = renderMenu();
    expect(screen.getByText('Conteúdos').style.height).toBe('48px');
    unmount();

    renderMenu({ menuItemHeight: 40 });
    expect(screen.getByText('Conteúdos').style.height).toBe('40px');
  });

  it('sideCollapsed esconde o rótulo do grupo e tira o nome da lista', () => {
    renderMenu({ sideCollapsed: true });

    expect(screen.queryByText('Site')).toBeNull();
    expect(screen.getByRole('list').hasAttribute('aria-labelledby')).toBe(false);
  });

  it('fora de um grupo, o item continua <div>, como no Ecme', () => {
    render(
      <Menu aria-label="Principal">
        <Menu.MenuItem eventKey="sites">Sites</Menu.MenuItem>
      </Menu>,
    );

    expect(screen.getByText('Sites').tagName).toBe('DIV');
  });
});

describe('NavToggle', () => {
  it('troca o ícone pelo toggled, sempre aria-hidden', () => {
    const { container, rerender } = render(<NavToggle className="text-2xl" />);
    const first = container.querySelector('svg')?.innerHTML;
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect((container.firstChild as HTMLElement).className).toBe('text-2xl');

    rerender(<NavToggle className="text-2xl" toggled />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('svg')?.innerHTML).not.toBe(first);
  });
});
