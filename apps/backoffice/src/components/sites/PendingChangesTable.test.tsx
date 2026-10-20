// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PendingChange } from '@/domain/pending-changes/list.ts';
import type { PendingOrigin } from '@/domain/pending-changes/record.ts';

import { PendingChangesTable } from './PendingChangesTable.tsx';

// Tela de pendências (#99): origem legível, item com link quando há tela e data no fuso do
// site; sem pendências, o estado vazio. Busca, filtro por origem, ordem e paginação com o
// estado na URL (#365): router.replace simulado.

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
    usePathname: () => '/sites/exemplo-a/pendencias',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(navigation.subscribe, navigation.get)),
    useRouter: () => ({ replace: (url: string) => navigation.set(url.split('?')[1] ?? '') }),
  };
});

afterEach(() => {
  cleanup();
  navigation.set('');
});

// Maior id, mais recente: a ordem do domínio (mais recente primeiro) é a de `rows`.
const change = (id: number, origin: PendingOrigin, reference: string): PendingChange => ({
  id,
  origin,
  reference,
  createdAt: new Date(Date.UTC(2026, 9, 1, 12, id)),
});

const rows: PendingChange[] = [
  change(9, 'config', 'v3'),
  change(8, 'content', '42'),
  change(7, 'author', '5'),
  change(6, 'taxonomy', '2'),
  change(5, 'menu', '1'),
  change(4, 'media', '11'),
  change(3, 'redirect', '7'),
  change(2, 'release', '2026.10.1'),
  change(1, 'platform', 'tokens'),
];

const renderTable = (data = rows) =>
  render(<PendingChangesTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={data} />);

const column = (index: number) =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[index]?.textContent);

// O filtro é o combobox do react-select: abre com a seta e escolhe a opção pelo nome.
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  screen.getByRole('combobox', { name: label }).focus();
  await user.keyboard('{ArrowDown}');
  await user.click(screen.getByRole('option', { name: option }));
}

describe('tabela de mudanças pendentes', () => {
  it('mostra a origem legível de cada uma das 9 origens, a mais recente primeiro', () => {
    renderTable();

    expect(column(0)).toEqual([
      'Configuração',
      'Conteúdo',
      'Autor',
      'Taxonomia',
      'Menu',
      'Mídia',
      'Redirecionamento',
      'Release',
      'Plataforma',
    ]);
    expect(screen.getByRole('status').textContent).toBe('9 resultados');
    expect(
      screen.getByRole('columnheader', { name: /Registrada em/ }).getAttribute('aria-sort'),
    ).toBe('descending');
  });

  it('cabeçalho de coluna em cada coluna e a contagem do DataTable', () => {
    renderTable([change(1, 'content', '42')]);

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Origem',
      'Item',
      'Registrada em',
    ]);
    expect(screen.getByRole('status').textContent).toBe('1 resultado');
  });

  it('liga o item à tela dele quando a origem tem tela, com o texto oculto "(abrir)"', () => {
    renderTable();

    const links = Object.fromEntries(
      screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]),
    );
    expect(links).toEqual({
      'Configuração v3 (abrir)': '/sites/exemplo-a/configuracao',
      'Conteúdo 42 (abrir)': '/sites/exemplo-a/conteudos/42',
      'Autor 5 (abrir)': '/sites/exemplo-a/autores/5',
      'Taxonomia 2 (abrir)': '/sites/exemplo-a/taxonomias/2',
      'Menu 1 (abrir)': '/sites/exemplo-a/menus/1',
      'Mídia 11 (abrir)': '/sites/exemplo-a/midia',
    });
    const link = screen.getByRole('link', { name: 'Conteúdo 42 (abrir)' });
    expect(link.className).toContain('font-semibold');
    expect(within(link).getByText('(abrir)', { exact: false }).className).toBe('sr-only');
  });

  it('sem tela, o item é só texto', () => {
    renderTable();

    for (const text of ['Redirecionamento 7', 'Release 2026.10.1', 'Plataforma tokens']) {
      expect(screen.getByText(text).closest('a')).toBeNull();
    }
  });

  it('mostra a data no fuso do site, com a sigla', () => {
    renderTable([change(0, 'content', '42')]);

    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 09:00 BRT');
  });

  it('sem pendências mostra o estado vazio no lugar da tabela e da toolbar', () => {
    renderTable([]);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('search')).toBeNull();
    expect(
      screen.getByText('Nenhuma mudança pendente: o site publicado está em dia.'),
    ).toBeTruthy();
  });
});

describe('busca, filtro, ordem e paginação (#365)', () => {
  it('busca pelo texto exibido do item, sem diferenciar maiúsculas e acentos', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.type(screen.getByLabelText('Buscar por item'), 'configuracao V3');

    expect(column(1)).toEqual(['Configuração v3 (abrir)']);
    expect(screen.getByRole('status').textContent).toBe('1 resultado');
    expect(navigation.get()).toBe('q=configuracao+V3');
  });

  it('o filtro por origem vai para a URL; "Limpar filtros" volta tudo', async () => {
    const user = userEvent.setup();
    renderTable();

    await choose(user, 'Origem', 'Mídia');
    expect(column(1)).toEqual(['Mídia 11 (abrir)']);
    expect(navigation.get()).toBe('origem=media');

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(navigation.get()).toBe('');
    expect(screen.getByRole('status').textContent).toBe('9 resultados');
  });

  it('origem e item ordenam pelo texto exibido', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(
      within(screen.getByRole('columnheader', { name: /Origem/ })).getByRole('button'),
    );
    expect(column(0)[0]).toBe('Autor');
    expect(column(0).at(-1)).toBe('Taxonomia');
    expect(navigation.get()).toBe('ordem=origin');

    await user.click(
      within(screen.getByRole('columnheader', { name: /Item/ })).getByRole('button'),
    );
    expect(column(1)[0]).toBe('Autor 5 (abrir)');
  });

  it('a URL de uma lista filtrada e ordenada restaura o mesmo estado', () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      change(index, index % 2 === 0 ? 'content' : 'menu', String(index)),
    );
    act(() => navigation.set('origem=content&ordem=createdAt&por-pagina=10'));
    renderTable(many);

    expect(screen.getByRole('combobox', { name: 'Origem' }).closest('.select')?.textContent).toBe(
      'Conteúdo',
    );
    expect(column(1)[0]).toBe('Conteúdo 0 (abrir)');
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.getByRole('status').textContent).toBe('15 resultados');
  });

  it('busca sem resultado mantém a tabela com a mensagem e 0 resultados', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.type(screen.getByLabelText('Buscar por item'), 'inexistente');

    expect(within(screen.getByRole('table')).getByText('Nenhuma mudança encontrada.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('0 resultados');
  });
});
