// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReviewQueueItem } from '@/domain/content/contents.ts';

import { ReviewQueueTable } from './ReviewQueueTable.tsx';

// Fila de revisão (#74): título, tipo, versão e data; links para a revisão e teclado.
// Busca, filtro por tipo, ordem e paginação com o estado na URL (#365): router.replace simulado.

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
    usePathname: () => '/sites/exemplo-a/revisao',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(navigation.subscribe, navigation.get)),
    useRouter: () => ({ replace: (url: string) => navigation.set(url.split('?')[1] ?? '') }),
  };
});

afterEach(() => {
  cleanup();
  navigation.set('');
});

const rows: ReviewQueueItem[] = [
  {
    id: 3,
    kind: 'page',
    title: 'Quem somos',
    version: 2,
    updatedAt: new Date('2026-10-01T12:00:00Z'),
  },
  {
    id: 1,
    kind: 'article',
    title: 'Guia de uso',
    version: 4,
    updatedAt: new Date('2026-10-02T15:30:00Z'),
  },
];

const renderTable = (data = rows, timeZone = 'America/Sao_Paulo') =>
  render(<ReviewQueueTable siteId="exemplo-a" timeZone={timeZone} rows={data} />);

// O filtro é o combobox do react-select: abre com a seta e escolhe a opção pelo nome.
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  screen.getByRole('combobox', { name: label }).focus();
  await user.keyboard('{ArrowDown}');
  await user.click(screen.getByRole('option', { name: option }));
}

describe('fila de revisão', () => {
  it('mostra título, tipo, versão e data de cada conteúdo, a mais antiga primeiro', () => {
    renderTable();

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Título',
      'Tipo',
      'Versão',
      'Enviado em',
    ]);
    const [, first, second] = screen.getAllByRole('row');
    expect(first?.textContent).toContain('Quem somos');
    expect(first?.textContent).toContain('Página');
    expect(first?.textContent).toContain('2');
    expect(first?.textContent).toContain('01/10/2026, 09:00 BRT');
    expect(second?.textContent).toContain('Guia de uso');
    expect(second?.textContent).toContain('Artigo');
    expect(screen.getByRole('status').textContent).toBe('2 resultados');
    expect(screen.getByRole('columnheader', { name: /Enviado em/ }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
  });

  it('o título leva à tela de revisão, com nome acessível, e o teclado alcança cada um', async () => {
    const user = userEvent.setup();
    renderTable();

    const first = screen.getByRole('link', { name: 'Quem somos (revisar)' });
    // Busca, filtro e cabeçalhos ordenáveis vêm antes: o Tab chega ao primeiro link.
    while (document.activeElement !== first) await user.tab();
    expect(first.getAttribute('href')).toBe('/sites/exemplo-a/revisao/3');
    expect(first.className).toContain('font-semibold');
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: 'Guia de uso (revisar)' }),
    );
  });

  it('mostra a data no fuso do site', () => {
    renderTable(rows, 'Europe/Lisbon');

    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 13:00 GMT+1');
  });

  it('fila vazia mostra o estado vazio no lugar da tabela e da toolbar', () => {
    renderTable([]);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.getByText('Nenhum conteúdo aguardando revisão.')).toBeTruthy();
  });
});

const titles = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('link')[0]?.textContent?.replace(' (revisar)', ''));

const many: ReviewQueueItem[] = Array.from({ length: 30 }, (_, index) => ({
  id: index + 10,
  kind: index % 3 === 0 ? 'page' : 'article',
  title: index === 0 ? 'Ação de graças' : `Receita ${String(index).padStart(2, '0')}`,
  version: (index % 4) + 1,
  // Mais recente quanto maior o índice.
  updatedAt: new Date(Date.UTC(2026, 8, 1 + index)),
}));

const renderMany = () =>
  render(<ReviewQueueTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={many} />);

describe('busca, filtro, ordem e paginação (#365)', () => {
  it('busca por palavra do título sem diferenciar maiúsculas e acentos', async () => {
    const user = userEvent.setup();
    renderMany();

    await user.type(screen.getByLabelText('Buscar por título'), 'ACAO');

    expect(titles()).toEqual(['Ação de graças']);
    expect(screen.getByRole('status').textContent).toBe('1 resultado');
    expect(navigation.get()).toBe('q=ACAO');
  });

  it('o filtro por tipo combina com a busca; "Limpar filtros" zera os dois', async () => {
    const user = userEvent.setup();
    renderMany();

    await choose(user, 'Tipo', 'Página');
    expect(screen.getByRole('status').textContent).toBe('10 resultados');
    expect(navigation.get()).toBe('tipo=page');
    await user.type(screen.getByLabelText('Buscar por título'), '2');
    expect(titles()).toEqual(['Receita 12', 'Receita 21', 'Receita 24', 'Receita 27']);

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    expect(navigation.get()).toBe('');
    expect(screen.getByRole('status').textContent).toBe('30 resultados');
  });

  it('título, tipo e versão ordenam; o tipo pelo rótulo exibido', async () => {
    const user = userEvent.setup();
    renderMany();
    const header = (name: RegExp) => screen.getByRole('columnheader', { name });

    await user.click(within(header(/Título/)).getByRole('button'));
    expect(header(/Título/).getAttribute('aria-sort')).toBe('ascending');
    expect(titles()[0]).toBe('Ação de graças');
    expect(navigation.get()).toBe('ordem=title');

    await user.click(within(header(/Tipo/)).getByRole('button'));
    const kinds = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[1]?.textContent);
    expect(kinds[0]).toBe('Artigo');
    expect(kinds.at(-1)).toBe('Página');

    // Número começa pelo maior (o padrão do TanStack para colunas numéricas).
    await user.click(within(header(/Versão/)).getByRole('button'));
    expect(header(/Versão/).getAttribute('aria-sort')).toBe('descending');
    expect(within(screen.getAllByRole('row')[1]!).getAllByRole('cell')[2]?.textContent).toBe('4');
  });

  it('25 por página, com contagem; o seletor de tamanho vai para a URL', async () => {
    const user = userEvent.setup();
    renderMany();

    expect(screen.getAllByRole('row')).toHaveLength(26);
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.getAllByRole('row')).toHaveLength(6);
    expect(navigation.get()).toBe('pagina=2');

    await choose(user, 'Itens por página', '10 / página');
    expect(navigation.get()).toContain('por-pagina=10');
  });

  it('a URL de uma lista filtrada e ordenada restaura o mesmo estado', () => {
    act(() => navigation.set('tipo=article&ordem=-updatedAt&q=receita'));
    renderMany();

    expect(screen.getByLabelText<HTMLInputElement>('Buscar por título').value).toBe('receita');
    expect(screen.getByRole('combobox', { name: 'Tipo' }).closest('.select')?.textContent).toBe(
      'Artigo',
    );
    expect(titles()[0]).toBe('Receita 29');
    expect(screen.getByRole('status').textContent).toBe('20 resultados');
  });

  it('busca sem resultado mantém a tabela com a mensagem e 0 resultados', async () => {
    const user = userEvent.setup();
    renderMany();

    await user.type(screen.getByLabelText('Buscar por título'), 'inexistente');

    expect(within(screen.getByRole('table')).getByText('Nenhum conteúdo encontrado.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('0 resultados');
  });

  it('título longo fica numa linha cortada, com o texto inteiro em title', () => {
    const title = 'Um título de conteúdo bem comprido, que não cabe na coluna da fila';
    renderTable([{ ...rows[0]!, title }]);

    const link = screen.getByRole('link', { name: `${title} (revisar)` });
    const text = within(link).getByText(title);
    expect(text.getAttribute('title')).toBe(title);
    expect(text.className).toContain('truncate');
  });
});
