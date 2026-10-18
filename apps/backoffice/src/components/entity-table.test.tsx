// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntityTable, type EntityRow } from './entity-table.tsx';

// Listas de autores, taxonomias e menus (#46): células, links por permissão e teclado. Criar
// é a ação do cabeçalho da página, repetida no estado vazio (#87). Busca por nome e paginação
// opcionais, com o estado na URL (#108): router.replace simulado.

const navigation = vi.hoisted(() => {
  let search = '';
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set: (next: string) => {
      search = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    usePathname: () => '/sites/exemplo-a/autores',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(navigation.subscribe, navigation.get)),
    useRouter: () => ({ replace: (url: string) => navigation.set(url.split('?')[1] ?? '') }),
  };
});

afterEach(() => {
  cleanup();
  navigation.set('');
});

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

// 30 autores, na ordem do servidor (ID): 2 páginas de 25.
const authors: EntityRow[] = Array.from({ length: 30 }, (_, index) => ({
  id: index + 1,
  name: index === 0 ? 'Ângela Souza' : `Autor ${String(index + 1).padStart(2, '0')}`,
  cells: [`autor-${index + 1}`],
}));

const renderAuthors = (data = authors) =>
  render(
    <EntityTable
      basePath="/sites/exemplo-a/autores"
      headers={['Nome', 'Slug']}
      rows={data}
      noun={{ one: 'autor', many: 'autores', none: 'Nenhum autor cadastrado.' }}
      search={{ label: 'Buscar por nome', notFound: 'Nenhum autor encontrado.' }}
    />,
  );

const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.firstElementChild?.textContent);

describe('busca por nome e paginação (#108)', () => {
  it('mantém a ordem do servidor, com 25 por página e a contagem', async () => {
    const user = userEvent.setup();
    renderAuthors();

    expect(names().slice(0, 2)).toEqual(['Ângela Souza', 'Autor 02']);
    expect(screen.getAllByRole('row')).toHaveLength(26);
    expect(screen.getByRole('status').textContent).toBe('30 resultados');
    expect(screen.queryByText('30 autores')).toBeNull();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toHaveProperty(
      'disabled',
      true,
    );

    await user.click(screen.getByRole('button', { name: 'Próxima página' }));

    expect(names()).toEqual(['Autor 26', 'Autor 27', 'Autor 28', 'Autor 29', 'Autor 30']);
    expect(screen.getByRole('button', { name: 'Próxima página' })).toHaveProperty('disabled', true);
    expect(navigation.get()).toBe('pagina=2');
  });

  it('a busca por nome ignora maiúsculas e acentos e não olha as outras células', async () => {
    const user = userEvent.setup();
    renderAuthors();

    await user.type(screen.getByLabelText('Buscar por nome'), 'ANGELA');
    expect(names()).toEqual(['Ângela Souza']);
    expect(screen.getByRole('status').textContent).toBe('1 resultado');
    expect(navigation.get()).toBe('q=ANGELA');

    await user.clear(screen.getByLabelText('Buscar por nome'));
    await user.type(screen.getByLabelText('Buscar por nome'), 'autor-3');
    expect(screen.getByText('Nenhum autor encontrado.')).toBeTruthy();
  });

  it('a URL com busca e página restaura o mesmo estado', () => {
    act(() => navigation.set('q=autor&pagina=2'));
    renderAuthors();

    expect(screen.getByLabelText<HTMLInputElement>('Buscar por nome').value).toBe('autor');
    expect(screen.getByText('Página 2 de 2')).toBeTruthy();
    expect(names()).toEqual(['Autor 27', 'Autor 28', 'Autor 29', 'Autor 30']);
  });

  it('busca sem resultado mostra a mensagem, e "Limpar busca" volta a lista', async () => {
    const user = userEvent.setup();
    renderAuthors();

    await user.type(screen.getByLabelText('Buscar por nome'), 'ninguém');
    expect(screen.queryByRole('table')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Limpar busca' }));

    expect(navigation.get()).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('Buscar por nome').value).toBe('');
    expect(screen.getAllByRole('row')).toHaveLength(26);
  });

  it('sem linhas, o estado vazio de cadastro, sem busca nem paginação', () => {
    renderAuthors([]);

    expect(screen.getByText('Nenhum autor cadastrado.')).toBeTruthy();
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).toBeNull();
  });

  it('sem `search` (menus), nem busca nem paginação, com a contagem de antes', () => {
    renderTable(false, authors.slice(0, 2));

    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).toBeNull();
    expect(screen.getByText('2 menus')).toBeTruthy();
  });
});
