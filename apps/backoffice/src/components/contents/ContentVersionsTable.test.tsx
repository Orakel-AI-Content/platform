// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContentVersionsTable, type ContentVersionRow } from './ContentVersionsTable.tsx';

// Versões de um conteúdo (#44): em ordem, cada uma com link para a leitura. Busca pelo título,
// filtro por status, ordem e paginação com o estado na URL (#366): router.replace simulado.

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
    usePathname: () => '/sites/exemplo-a/conteudos/7',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(navigation.subscribe, navigation.get)),
    useRouter: () => ({ replace: (url: string) => navigation.set(url.split('?')[1] ?? '') }),
  };
});

afterEach(() => {
  cleanup();
  navigation.set('');
});

const rows: ContentVersionRow[] = [1, 2, 3].map((version) => ({
  version,
  status: version === 1 ? 'publicado' : 'rascunho',
  title: `Guia v${version}`,
  createdAt: new Date(`2026-10-0${version}T12:00:00Z`),
  approval: null,
}));

const renderTable = (data = rows) =>
  render(
    <ContentVersionsTable
      siteId="exemplo-a"
      contentId={7}
      timeZone="America/Sao_Paulo"
      rows={data}
    />,
  );

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

/** Cor do ponto da tag (o `prefixClass` da Tag do Ecme) em que o texto aparece. */
function tagColor(element: HTMLElement) {
  return element.closest('.tag')?.querySelector('.tag-prefix')?.className;
}

describe('tabela de versões', () => {
  it('lista as versões em ordem crescente com link para cada uma', () => {
    render(
      <ContentVersionsTable
        siteId="exemplo-a"
        contentId={7}
        timeZone="America/Sao_Paulo"
        rows={rows}
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Versão 1', 'Versão 2', 'Versão 3']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/sites/exemplo-a/conteudos/7/versoes/1',
      '/sites/exemplo-a/conteudos/7/versoes/2',
      '/sites/exemplo-a/conteudos/7/versoes/3',
    ]);
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('Publicado');
    expect(screen.getByRole('status').textContent).toBe('3 resultados');
    expect(screen.getByRole('columnheader', { name: /Versão/ }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Versão',
      'Status',
      'Título',
      'Gravada em',
      'Aprovação',
    ]);
  });

  it('dá a cada status a tag da sua cor, com o texto do status (#86)', () => {
    render(
      <ContentVersionsTable
        siteId="exemplo-a"
        contentId={7}
        timeZone="America/Sao_Paulo"
        rows={rows}
      />,
    );

    expect(tagColor(screen.getByText('Publicado'))).toContain('bg-success');
    for (const tag of screen.getAllByText('Rascunho')) {
      expect(tagColor(tag)).toContain('bg-gray-400');
    }
  });

  it('mostra a data de cada versão no fuso do site, com a sigla (#90)', () => {
    const { rerender } = render(
      <ContentVersionsTable
        siteId="exemplo-a"
        contentId={7}
        timeZone="America/Sao_Paulo"
        rows={rows}
      />,
    );
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 09:00 BRT');

    rerender(
      <ContentVersionsTable
        siteId="exemplo-a"
        contentId={7}
        timeZone="Europe/Lisbon"
        rows={rows}
      />,
    );
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 13:00 GMT+1');
  });

  it('mostra quem aprovou e quando, no fuso do site; sem aprovação, a célula fica vazia (#76)', () => {
    const approved: ContentVersionRow[] = [
      { ...rows[0]!, approval: null },
      {
        ...rows[1]!,
        status: 'aprovado',
        approval: {
          reviewer: 'revisor@orakel.local',
          approvedAt: new Date('2026-10-01T12:00:00Z'),
        },
      },
    ];
    render(
      <ContentVersionsTable
        siteId="exemplo-a"
        contentId={7}
        timeZone="America/Sao_Paulo"
        rows={approved}
      />,
    );

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toContain('Aprovação');
    const [, first, second] = screen.getAllByRole('row');
    const approvalCell = (row: HTMLElement | undefined) => row?.querySelectorAll('td')[4];
    expect(approvalCell(first)?.textContent).toBe('');
    expect(approvalCell(second)?.textContent).toContain('revisor@orakel.local');
    expect(approvalCell(second)?.textContent).toContain('01/10/2026, 09:00 BRT');
    // O `TwoLines` compartilhado: o revisor e, embaixo, a data menor.
    expect(within(approvalCell(second)!).getByText('01/10/2026, 09:00 BRT').className).toBe(
      'text-xs',
    );
  });

  it('sem versões mostra o estado vazio no lugar da tabela e da toolbar', () => {
    renderTable([]);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.getByText('Nenhuma versão registrada.')).toBeTruthy();
  });
});

describe('busca, filtro, ordem e paginação (#366)', () => {
  const many: ContentVersionRow[] = Array.from({ length: 30 }, (_, index) => ({
    version: index + 1,
    status: index % 3 === 0 ? 'publicado' : 'rascunho',
    title: index < 20 ? `Guia de café v${index + 1}` : `Receita v${index + 1}`,
    createdAt: new Date(Date.UTC(2026, 9, 1, 12, index)),
    approval: null,
  }));

  it('busca pelo título, sem diferenciar maiúsculas e acentos', async () => {
    const user = userEvent.setup();
    renderTable(many);

    await user.type(screen.getByLabelText('Buscar por título'), 'RECEITA');

    expect(screen.getByRole('status').textContent).toBe('10 resultados');
    expect(column(2).every((title) => title?.startsWith('Receita'))).toBe(true);
    expect(navigation.get()).toBe('q=RECEITA');

    await user.clear(screen.getByLabelText('Buscar por título'));
    await user.type(screen.getByLabelText('Buscar por título'), 'cafe v3');
    expect(column(2)).toEqual(['Guia de café v3']);
  });

  it('o filtro por status vai para a URL; "Limpar filtros" volta tudo', async () => {
    const user = userEvent.setup();
    renderTable(many);

    await choose(user, 'Status', 'Publicado');
    expect(screen.getByRole('status').textContent).toBe('10 resultados');
    expect(column(1).every((status) => status === 'Publicado')).toBe(true);
    expect(navigation.get()).toBe('status=publicado');

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(navigation.get()).toBe('');
    expect(screen.getByRole('status').textContent).toBe('30 resultados');
  });

  it('pagina em 25 por padrão e ordena pela versão, da primeira à mais recente', async () => {
    const user = userEvent.setup();
    renderTable(many);

    expect(screen.getAllByRole('row')).toHaveLength(26);
    expect(column(0)[0]).toBe('Versão 1');

    await user.click(
      within(screen.getByRole('columnheader', { name: /Versão/ })).getByRole('button'),
    );
    expect(column(0)[0]).toBe('Versão 30');
    expect(navigation.get()).toBe('ordem=-version');
  });

  it('a URL de uma lista filtrada e ordenada restaura o mesmo estado', () => {
    act(() => navigation.set('status=rascunho&ordem=-createdAt&por-pagina=25'));
    renderTable(many);

    expect(screen.getByRole('combobox', { name: 'Status' }).closest('.select')?.textContent).toBe(
      'Rascunho',
    );
    expect(column(0)[0]).toBe('Versão 30');
    expect(screen.getAllByRole('row')).toHaveLength(21);
    expect(screen.getByRole('status').textContent).toBe('20 resultados');
  });

  it('filtro sem resultado mantém a tabela com a mensagem e 0 resultados', async () => {
    const user = userEvent.setup();
    renderTable(many);

    await choose(user, 'Status', 'Agendado');

    expect(within(screen.getByRole('table')).getByText('Nenhuma versão encontrada.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('0 resultados');
  });
});
