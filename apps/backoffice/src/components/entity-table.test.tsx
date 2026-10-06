// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { EntityTable, type EntityRow } from './entity-table.tsx';

// Listas de autores, taxonomias e menus (#46): células, links por permissão e teclado.

afterEach(cleanup);

const rows: EntityRow[] = [
  { id: 1, name: 'principal', cells: ['Início (/) · Guias (/guias)'] },
  { id: 2, name: 'rodape', cells: ['Contato (/contato)'] },
];

const renderTable = (canWrite = false, data = rows) =>
  render(
    <EntityTable
      basePath="/sites/exemplo-a/menus"
      headers={['Chave', 'Itens']}
      rows={data}
      noun={{ one: 'menu', many: 'menus', none: 'Nenhum menu cadastrado.' }}
      createLabel="Criar menu"
      canWrite={canWrite}
    />,
  );

describe('tabela de entidades', () => {
  it('mostra o nome e as células de cada linha', () => {
    renderTable();

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Chave',
      'Itens',
    ]);
    expect(screen.getAllByRole('row')[1]?.textContent).toBe('principalInício (/) · Guias (/guias)');
    expect(screen.getByText('2 menus')).toBeTruthy();
  });

  it('sem content.write não há links de criar nem de editar', () => {
    renderTable();

    expect(screen.queryAllByRole('link')).toEqual([]);
  });

  it('com content.write, criar e editar pelo teclado', async () => {
    const user = userEvent.setup();
    renderTable(true);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Criar menu' }));
    expect(screen.getByRole('link', { name: 'Criar menu' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/menus/novo',
    );
    await user.tab();
    const edit = screen.getByRole('link', { name: 'Editar principal' });
    expect(document.activeElement).toBe(edit);
    expect(edit.getAttribute('href')).toBe('/sites/exemplo-a/menus/1');
  });

  it('avisa quando não há nada cadastrado', () => {
    renderTable(true, []);

    expect(screen.getByText('Nenhum menu cadastrado.')).toBeTruthy();
  });
});
