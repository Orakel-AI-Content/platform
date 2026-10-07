// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { afterEach, describe, expect, it } from 'vitest';

import { EntityTable, type EntityRow } from './entity-table.tsx';

// Listas de autores, taxonomias e menus (#46): células, links por permissão e teclado. Criar
// é a ação do cabeçalho da página, repetida no estado vazio (#87).

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
      canWrite={canWrite}
      emptyAction={
        canWrite ? <Link href="/sites/exemplo-a/menus/novo">Criar menu</Link> : undefined
      }
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

  it('com content.write, editar pelo teclado e sem link de criar na tabela', async () => {
    const user = userEvent.setup();
    renderTable(true);

    expect(screen.queryByRole('link', { name: 'Criar menu' })).toBeNull();
    await user.tab();
    const edit = screen.getByRole('link', { name: 'Editar principal' });
    expect(document.activeElement).toBe(edit);
    expect(edit.getAttribute('href')).toBe('/sites/exemplo-a/menus/1');
  });

  it('sem linhas mostra o estado vazio com a ação no lugar da tabela', () => {
    renderTable(true, []);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Nenhum menu cadastrado.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Criar menu' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/menus/novo',
    );
  });

  it('sem linhas e sem content.write, o estado vazio não tem ação', () => {
    renderTable(false, []);

    expect(screen.getByText('Nenhum menu cadastrado.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
