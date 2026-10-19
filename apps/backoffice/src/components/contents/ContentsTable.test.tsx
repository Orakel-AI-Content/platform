// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContentListItem } from '@/domain/content/contents.ts';

import { ContentsTable } from './ContentsTable.tsx';

// Lista de conteúdos (#44): status da versão mais recente, links por permissão e teclado.
// Busca, filtros, ordem e paginação com o estado na URL (#107): router.replace simulado.

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
    usePathname: () => '/sites/exemplo-a/conteudos',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(navigation.subscribe, navigation.get)),
    useRouter: () => ({ replace: (url: string) => navigation.set(url.split('?')[1] ?? '') }),
  };
});

afterEach(() => {
  cleanup();
  navigation.set('');
});

const rows: ContentListItem[] = [
  {
    id: 1,
    kind: 'article',
    title: 'Guia de uso',
    slug: 'guia-de-uso',
    status: 'em_revisao',
    version: 3,
    updatedAt: new Date('2026-10-01T12:00:00Z'),
  },
  {
    id: 2,
    kind: 'page',
    title: 'Sobre',
    slug: 'sobre',
    status: 'publicado',
    version: 1,
    updatedAt: new Date('2026-09-20T09:30:00Z'),
  },
];

/** Cor do ponto da tag (o `prefixClass` da Tag do Ecme) em que o texto aparece. */
function tagColor(element: HTMLElement) {
  return element.closest('.tag')?.querySelector('.tag-prefix')?.className;
}

// O filtro é o combobox do react-select: abre com a seta e escolhe a opção pelo nome.
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  screen.getByRole('combobox', { name: label }).focus();
  await user.keyboard('{ArrowDown}');
  await user.click(screen.getByRole('option', { name: option }));
}

describe('tabela de conteúdos', () => {
  it('mostra cada conteúdo com tipo e status da versão mais recente', () => {
    render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />);

    const [, first, second] = screen.getAllByRole('row');
    expect(first?.textContent).toContain('Artigo');
    expect(first?.textContent).toContain('Guia de uso');
    expect(first?.textContent).toContain('Em revisão');
    expect(second?.textContent).toContain('Página');
    expect(second?.textContent).toContain('Publicado');
    expect(screen.getByRole('status').textContent).toBe('2 resultados');
  });

  it('dá a cada status a tag da sua cor, com o texto do status (#86)', () => {
    const draft: ContentListItem = {
      ...rows[0]!,
      id: 3,
      title: 'Rascunho novo',
      status: 'rascunho',
    };
    render(
      <ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={[...rows, draft]} />,
    );

    const table = within(screen.getByRole('table'));
    expect(tagColor(table.getByText('Em revisão'))).toContain('bg-warning');
    expect(tagColor(table.getByText('Publicado'))).toContain('bg-success');
    expect(tagColor(table.getByText('Rascunho'))).toContain('bg-gray-400');
  });

  it('sem content.write não tem links de criar nem de editar', () => {
    render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />);

    expect(screen.queryByRole('link', { name: 'Criar conteúdo' })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Editar/ })).toBeNull();
  });

  it('com content.write tem o link de editar, e o de criar fica no cabeçalho da página', () => {
    render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} canWrite />);

    expect(screen.queryByRole('link', { name: 'Criar conteúdo' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Editar Guia de uso' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/conteudos/1/editar',
    );
  });

  it('o teclado alcança o link de versões de cada linha', async () => {
    const user = userEvent.setup();
    render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />);

    const first = screen.getByRole('link', { name: 'Guia de uso (versões)' });
    // Busca, filtros e cabeçalhos ordenáveis vêm antes: o Tab chega ao primeiro link.
    while (document.activeElement !== first) await user.tab();
    expect(first.getAttribute('href')).toBe('/sites/exemplo-a/conteudos/1');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Sobre (versões)' }));
  });

  it('sem conteúdo mostra o estado vazio no lugar da tabela, com a ação recebida', () => {
    render(
      <ContentsTable
        siteId="exemplo-a"
        timeZone="America/Sao_Paulo"
        rows={[]}
        canWrite
        emptyAction={<Link href="/sites/exemplo-a/conteudos/novo">Criar conteúdo</Link>}
      />,
    );

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.getByText('Nenhum conteúdo cadastrado.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Criar conteúdo' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/conteudos/novo',
    );
  });

  it('mostra a data de atualização no fuso do site, com a sigla (#90)', () => {
    const { rerender } = render(
      <ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />,
    );
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 09:00 BRT');

    rerender(<ContentsTable siteId="exemplo-a" timeZone="Europe/Lisbon" rows={rows} />);
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 13:00 GMT+1');
  });
});

const titles = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('link')[0]?.textContent?.replace(' (versões)', ''));

const many: ContentListItem[] = Array.from({ length: 30 }, (_, index) => ({
  id: index + 10,
  kind: index % 3 === 0 ? 'page' : 'article',
  title: index === 0 ? 'Ação de graças' : `Receita ${String(index).padStart(2, '0')}`,
  slug: `c-${index}`,
  status: index % 2 === 0 ? 'publicado' : 'rascunho',
  version: 1,
  // Mais recente quanto maior o índice.
  updatedAt: new Date(Date.UTC(2026, 8, 1 + index)),
}));

function renderMany() {
  return render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={many} />);
}

describe('busca, filtros, ordem e paginação (#107)', () => {
  it('sem parâmetros, ordena pela última alteração, da mais recente para a mais antiga', () => {
    renderMany();

    expect(titles().slice(0, 3)).toEqual(['Receita 29', 'Receita 28', 'Receita 27']);
    expect(
      screen.getByRole('columnheader', { name: /Última alteração/ }).getAttribute('aria-sort'),
    ).toBe('descending');
    expect(screen.getByRole('columnheader', { name: 'Versão' }).getAttribute('aria-sort')).toBe(
      null,
    );
  });

  it('busca por palavra do título sem diferenciar maiúsculas e acentos', async () => {
    const user = userEvent.setup();
    renderMany();

    await user.type(screen.getByLabelText('Buscar por título'), 'ACAO');

    expect(titles()).toEqual(['Ação de graças']);
    expect(screen.getByRole('status').textContent).toBe('1 resultado');
    expect(navigation.get()).toBe('q=ACAO');
  });

  it('filtros por tipo e status combinam com a busca; "Limpar filtros" zera tudo', async () => {
    const user = userEvent.setup();
    renderMany();

    await choose(user, 'Tipo', 'Página');
    await choose(user, 'Status', 'Rascunho');
    expect(titles()).toEqual([
      'Receita 27',
      'Receita 21',
      'Receita 15',
      'Receita 09',
      'Receita 03',
    ]);
    await user.type(screen.getByLabelText('Buscar por título'), '2');
    expect(titles()).toEqual(['Receita 27', 'Receita 21']);

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    expect(navigation.get()).toBe('');
    expect(screen.getByRole('status').textContent).toBe('30 resultados');
  });

  it('clicar num cabeçalho ordenável inverte a ordem, com aria-sort no sentido', async () => {
    const user = userEvent.setup();
    renderMany();
    const header = () => screen.getByRole('columnheader', { name: /Título/ });

    await user.click(within(header()).getByRole('button'));
    expect(header().getAttribute('aria-sort')).toBe('ascending');
    expect(titles()[0]).toBe('Ação de graças');
    await user.click(within(header()).getByRole('button'));
    expect(header().getAttribute('aria-sort')).toBe('descending');
    expect(titles()[0]).toBe('Receita 29');
    expect(navigation.get()).toBe('ordem=-title');
  });

  it('tipo e status ordenam pelo rótulo exibido', async () => {
    const user = userEvent.setup();
    renderMany();

    await user.click(
      within(screen.getByRole('columnheader', { name: /Status/ })).getByRole('button'),
    );

    const statuses = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[2]?.textContent);
    expect(statuses[0]).toBe('Publicado');
    expect(statuses.at(-1)).toBe('Rascunho');
  });

  it('25 por página, com contagem e Página anterior/Próxima página', async () => {
    const user = userEvent.setup();
    renderMany();

    expect(screen.getAllByRole('row')).toHaveLength(26);
    expect(screen.getByRole('status').textContent).toBe('30 resultados');
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));

    expect(screen.getAllByRole('row')).toHaveLength(6);
    expect(navigation.get()).toBe('pagina=2');
  });

  it('a URL de uma lista filtrada, ordenada e paginada restaura o mesmo estado', () => {
    act(() => navigation.set('status=publicado&ordem=title&pagina=1&q=receita'));
    renderMany();

    expect(screen.getByLabelText<HTMLInputElement>('Buscar por título').value).toBe('receita');
    expect(screen.getByRole('combobox', { name: 'Status' }).closest('.select')?.textContent).toBe(
      'Publicado',
    );
    expect(titles()[0]).toBe('Receita 02');
    expect(screen.getByRole('status').textContent).toBe('14 resultados');
  });

  it('busca sem resultado mostra a mensagem e "Limpar busca" volta a lista inteira', async () => {
    const user = userEvent.setup();
    renderMany();

    await user.type(screen.getByLabelText('Buscar por título'), 'inexistente');

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Nenhum conteúdo encontrado.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Limpar busca' }));

    expect(navigation.get()).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('Buscar por título').value).toBe('');
    expect(screen.getAllByRole('row')).toHaveLength(26);
  });
});
