// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MenuItem } from '../MenuItem/index.tsx';
import { Dropdown } from './index.ts';

// Dropdown do Ecme (#210) sobre o floating-ui: gatilho alcançável pelo Tab com aria-haspopup e
// aria-expanded, itens registrados na navegação por setas e typeahead, e papéis de menu.

afterEach(cleanup);

function Acoes({ onSelect = vi.fn() }: { onSelect?: (key: string) => void }) {
  return (
    <Dropdown title="Ações">
      <Dropdown.Item variant="header">Artigo</Dropdown.Item>
      <Dropdown.Item eventKey="editar" onSelect={onSelect}>
        Editar
      </Dropdown.Item>
      <Dropdown.Item eventKey="duplicar" onSelect={onSelect} disabled>
        Duplicar
      </Dropdown.Item>
      <Dropdown.Item variant="divider" />
      <Dropdown.Item eventKey="publicar" onSelect={onSelect}>
        Publicar
      </Dropdown.Item>
    </Dropdown>
  );
}

const focused = () => document.activeElement?.textContent?.trim();

describe('Dropdown', () => {
  it('gatilho <button> com aria-haspopup e aria-expanded', async () => {
    render(<Acoes />);

    const toggle = screen.getByRole('button', { name: 'Ações' });
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('aria-haspopup')).toBe('menu');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

    toggle.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('papéis: itens menuitem, divisor separator, cabeçalho presentation, <ul> none', async () => {
    render(<Acoes />);
    await userEvent.click(screen.getByRole('button', { name: 'Ações' }));

    const menu = await screen.findByRole('menu');
    expect(menu.querySelector('ul')?.getAttribute('role')).toBe('none');
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Editar',
      'Duplicar',
      'Publicar',
    ]);
    expect(screen.getByRole('separator').className).toContain('menu-item-divider');
    expect(screen.getByText('Artigo').getAttribute('role')).toBe('presentation');
    expect(screen.getByRole('menuitem', { name: 'Duplicar' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });

  it('setas percorrem os itens pulando o desabilitado; typeahead vai pela inicial', async () => {
    render(<Acoes />);
    const toggle = screen.getByRole('button', { name: 'Ações' });
    toggle.focus();
    await userEvent.keyboard('{ArrowDown}');
    await screen.findByRole('menu');

    await waitFor(() => expect(focused()).toBe('Editar'));
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(focused()).toBe('Publicar'));
    await userEvent.keyboard('{ArrowUp}');
    await waitFor(() => expect(focused()).toBe('Editar'));
    await userEvent.keyboard('p');
    await waitFor(() => expect(focused()).toBe('Publicar'));
  });

  it('Enter no item chama onSelect com o eventKey e fecha o menu', async () => {
    const onSelect = vi.fn();
    render(<Acoes onSelect={onSelect} />);
    const toggle = screen.getByRole('button', { name: 'Ações' });
    toggle.focus();
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(focused()).toBe('Editar'));

    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('editar', expect.anything());
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(toggle));
  });

  it('Espaço também escolhe; o desabilitado não chama onSelect', async () => {
    const onSelect = vi.fn();
    render(<Acoes onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ações' }));

    screen.getByRole('menuitem', { name: 'Duplicar' }).focus();
    await userEvent.keyboard(' ');
    expect(onSelect).not.toHaveBeenCalled();
    screen.getByRole('menuitem', { name: 'Publicar' }).focus();
    await userEvent.keyboard(' ');
    expect(onSelect).toHaveBeenCalledWith('publicar', expect.anything());
  });

  it('Esc fecha e devolve o foco ao gatilho', async () => {
    render(<Acoes />);
    const toggle = screen.getByRole('button', { name: 'Ações' });
    toggle.focus();
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(focused()).toBe('Editar'));

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(toggle));
  });

  it('desabilitado: aria-disabled, fora do Tab e não abre', async () => {
    render(
      <Dropdown title="Mais" disabled>
        <Dropdown.Item eventKey="a">A</Dropdown.Item>
      </Dropdown>,
    );

    const toggle = screen.getByRole('button', { name: 'Mais' });
    expect(toggle.getAttribute('aria-disabled')).toBe('true');
    expect(toggle.getAttribute('tabindex')).toBe('-1');
    await userEvent.click(toggle);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renderTitle: <div role="button"> focável', () => {
    render(
      <Dropdown renderTitle={<span>Perfil</span>}>
        <Dropdown.Item eventKey="sair">Sair</Dropdown.Item>
      </Dropdown>,
    );

    const toggle = screen.getByRole('button', { name: 'Perfil' });
    expect(toggle.tagName).toBe('DIV');
    expect(toggle.getAttribute('tabindex')).toBe('0');
    expect(toggle.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('activeKey marca o item ativo', async () => {
    render(
      <Dropdown title="Ordem" activeKey="data">
        <Dropdown.Item eventKey="titulo">Título</Dropdown.Item>
        <Dropdown.Item eventKey="data">Data</Dropdown.Item>
      </Dropdown>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ordem' }));

    expect((await screen.findByRole('menuitem', { name: 'Data' })).className).toContain(
      'menu-item-active',
    );
    expect(screen.getByRole('menuitem', { name: 'Título' }).className).not.toContain(
      'menu-item-active',
    );
  });

  it('menuitemradio: o item atual é anunciado como marcado e segue nas setas', async () => {
    const user = userEvent.setup();
    render(
      <Dropdown title="Ordem" activeKey="data">
        {['titulo', 'data'].map((key) => (
          <Dropdown.Item
            key={key}
            eventKey={key}
            role="menuitemradio"
            aria-checked={key === 'data'}
          >
            {key === 'data' ? 'Data' : 'Título'}
          </Dropdown.Item>
        ))}
      </Dropdown>,
    );
    screen.getByRole('button', { name: 'Ordem' }).focus();
    await user.keyboard('{Enter}');

    const data = await screen.findByRole('menuitemradio', { name: 'Data' });
    const titulo = screen.getByRole('menuitemradio', { name: 'Título' });
    expect(data.getAttribute('aria-checked')).toBe('true');
    expect(titulo.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByRole('menuitem')).toBeNull();

    // As setas percorrem os itens, como os menuitem.
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).toBe(data));
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(document.activeElement).toBe(titulo));
  });

  it('submenu: o item que o abre é menuitem com aria-haspopup', async () => {
    render(
      <Dropdown title="Exportar">
        <Dropdown.Item eventKey="pdf">PDF</Dropdown.Item>
        <Dropdown.Menu title="Planilha">
          <Dropdown.Item eventKey="csv">CSV</Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Exportar' }));

    const sub = await screen.findByRole('menuitem', { name: 'Planilha' });
    expect(sub.getAttribute('aria-haspopup')).toBe('menu');
    expect(sub.className).not.toContain('outline-hidden');
    expect(sub.querySelector('ul')?.getAttribute('role')).toBe('none');
  });
});

describe('MenuItem', () => {
  it('classes do Ecme: hover, ativo, desabilitado e altura de 42 px', () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <MenuItem eventKey="a" onSelect={onSelect}>
        Item
      </MenuItem>,
    );

    const item = screen.getByText('Item');
    expect(item.className).toContain('menu-item');
    expect(item.className).toContain('menu-item-hoverable');
    expect(item.style.height).toBe('42px');

    rerender(
      <MenuItem eventKey="a" isActive disabled>
        Item
      </MenuItem>,
    );
    expect(item.className).toContain('menu-item-active');
    expect(item.className).toContain('menu-item-disabled');
    expect(item.className).not.toContain('menu-item-hoverable');
  });

  it('onSelect recebe o eventKey', async () => {
    const onSelect = vi.fn();
    render(
      <MenuItem eventKey="config" onSelect={onSelect}>
        Configurações
      </MenuItem>,
    );

    await userEvent.click(screen.getByText('Configurações'));
    expect(onSelect).toHaveBeenCalledWith('config', expect.anything());
  });
});
