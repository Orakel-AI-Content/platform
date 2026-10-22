// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Link from 'next/link';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { EntityTable, type EntityRow } from './EntityTable.tsx';

// Listas de autores, taxonomias e menus (#46): células, links por permissão e teclado. Criar
// é a ação do cabeçalho da página, repetida no estado vazio (#87). Busca por nome, paginação e
// tamanho com o estado na URL (#108), no DataTable do template (#363): router.replace simulado.

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

beforeAll(() => {
  // A dica do botão de editar abre no foco; o happy-dom rejeita a animação nativa que o motion
  // cancela ao desmontar.
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
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
      empty="Nenhum menu cadastrado."
      search={{ label: 'Buscar por chave', notFound: 'Nenhum menu encontrado.' }}
      truncated={[0]}
      canWrite={canWrite}
      emptyAction={
        canWrite ? <Link href="/sites/exemplo-a/menus/novo">Criar menu</Link> : undefined
      }
    />,
  );

// O seletor de tamanho é o combobox do react-select: abre com a seta e escolhe a opção.
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  screen.getByRole('combobox', { name: label }).focus();
  await user.keyboard('{ArrowDown}');
  await user.click(screen.getByRole('option', { name: option }));
}

describe('tabela de entidades', () => {
  it('mostra o nome e as células de cada linha, com a contagem', () => {
    renderTable();

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Chave',
      'Itens',
    ]);
    expect(screen.getAllByRole('row')[1]?.textContent).toBe('principalInício (/) · Guias (/guias)');
    expect(screen.getByRole('status').textContent).toBe('2 resultados');
  });

  it('a célula declarada em `truncated` fica numa linha cortada, com o texto inteiro em title', () => {
    renderTable();

    const text = screen.getByText('Início (/) · Guias (/guias)');
    expect(text.getAttribute('title')).toBe('Início (/) · Guias (/guias)');
    expect(text.className).toContain('truncate');
    // O nome não é cortado.
    expect(screen.getByText('principal').getAttribute('title')).toBeNull();
  });

  it('sem content.write não há links de criar nem de editar', () => {
    renderTable();

    expect(screen.queryAllByRole('link')).toEqual([]);
    expect(screen.queryByRole('columnheader', { name: 'Ações' })).toBeNull();
  });

  it('com content.write, editar pelo teclado e sem link de criar na tabela', async () => {
    const user = userEvent.setup();
    renderTable(true);

    expect(screen.queryByRole('link', { name: 'Criar menu' })).toBeNull();
    await user.tab();
    await user.tab();
    const edit = screen.getByRole('link', { name: 'Editar principal' });
    expect(document.activeElement).toBe(edit);
    expect(edit.getAttribute('href')).toBe('/sites/exemplo-a/menus/1');
    // Botão de ícone (#441): só o lápis, `aria-hidden`, e o nome sem a descrição da dica.
    expect(edit.textContent).toBe('');
    expect(edit.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(edit.getAttribute('aria-describedby')).toBeNull();
  });

  it('sem linhas mostra o estado vazio com a ação no lugar da toolbar e da tabela', () => {
    renderTable(true, []);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('search')).toBeNull();
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
      empty="Nenhum autor cadastrado."
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
    // Sem cabeçalho ordenável: a ordem é a do servidor.
    expect(screen.queryAllByRole('button', { name: /Nome|Slug/ })).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Próxima página' }));

    expect(names()).toEqual(['Autor 26', 'Autor 27', 'Autor 28', 'Autor 29', 'Autor 30']);
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
    expect(within(screen.getByRole('table')).getByText('Nenhum autor encontrado.')).toBeTruthy();
  });

  it('a URL com busca, página e tamanho restaura o mesmo estado', () => {
    act(() => navigation.set('q=autor&pagina=2&por-pagina=10'));
    renderAuthors();

    expect(screen.getByLabelText<HTMLInputElement>('Buscar por nome').value).toBe('autor');
    expect(names()).toEqual([
      'Autor 12',
      'Autor 13',
      'Autor 14',
      'Autor 15',
      'Autor 16',
      'Autor 17',
      'Autor 18',
      'Autor 19',
      'Autor 20',
      'Autor 21',
    ]);
    expect(screen.getByRole('status').textContent).toBe('29 resultados');
  });

  it('busca sem resultado mantém a tabela com 0 resultados; "Limpar filtros" volta tudo', async () => {
    const user = userEvent.setup();
    renderAuthors();

    await user.type(screen.getByLabelText('Buscar por nome'), 'ninguém');
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Nenhum autor encontrado.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('0 resultados');
    // A única ação de limpar é a da toolbar (#361).
    expect(screen.queryByRole('button', { name: 'Limpar busca' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    expect(navigation.get()).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('Buscar por nome').value).toBe('');
    expect(screen.getAllByRole('row')).toHaveLength(26);
  });

  it('o seletor de tamanho troca os itens por página e vai para a URL (#363)', async () => {
    const user = userEvent.setup();
    renderAuthors();

    await choose(user, 'Itens por página', '10 / página');

    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(navigation.get()).toBe('por-pagina=10');
  });

  it('sem linhas, o estado vazio de cadastro, sem busca nem paginação', () => {
    renderAuthors([]);

    expect(screen.getByText('Nenhum autor cadastrado.')).toBeTruthy();
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).toBeNull();
  });
});
