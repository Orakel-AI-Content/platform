// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  listStateQuery,
  normalizeText,
  PAGE_SIZE,
  parseListState,
  useListState,
  type ListConfig,
} from './list-state.ts';

// Estado de lista na URL (#106): normalização da busca, leitura e escrita dos searchParams.

const navigation = vi.hoisted(() => ({
  replace: vi.fn<(url: string, options?: { scroll: boolean }) => void>(),
  search: '',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => '/sites/exemplo-a/conteudos',
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  navigation.search = '';
});

const config: ListConfig = {
  filters: [
    { column: 'kind', param: 'tipo', values: ['article', 'page'] },
    { column: 'status', param: 'status', values: ['rascunho', 'publicado'] },
  ],
  sortable: ['title', 'updatedAt'],
  defaultSort: { id: 'updatedAt', desc: true },
};

const params = (query: string) => new URLSearchParams(query);

describe('normalizeText', () => {
  it('ignora maiúsculas e acentos', () => {
    expect(normalizeText('Ação').includes(normalizeText('acao'))).toBe(true);
    expect(normalizeText('ação').includes(normalizeText('ÇÃO'))).toBe(true);
    expect(normalizeText('Pão de Açúcar')).toBe('pao de acucar');
  });
});

describe('parseListState', () => {
  it('sem parâmetros, o padrão: busca vazia, sem filtro, ordem padrão, página 1', () => {
    expect(parseListState(params(''), config)).toEqual({
      search: '',
      filters: {},
      sort: { id: 'updatedAt', desc: true },
      page: 1,
    });
  });

  it('restaura busca, filtros, ordem e página da URL', () => {
    expect(
      parseListState(params('q=guia&tipo=page&status=rascunho&ordem=-title&pagina=3'), config),
    ).toEqual({
      search: 'guia',
      filters: { kind: 'page', status: 'rascunho' },
      sort: { id: 'title', desc: true },
      page: 3,
    });
    expect(parseListState(params('ordem=title'), config).sort).toEqual({
      id: 'title',
      desc: false,
    });
  });

  it('parâmetro inválido cai no padrão', () => {
    expect(parseListState(params('tipo=video&ordem=-slug&pagina=abc'), config)).toMatchObject({
      filters: {},
      sort: { id: 'updatedAt', desc: true },
      page: 1,
    });
    expect(parseListState(params('pagina=0'), config).page).toBe(1);
    expect(parseListState(params('pagina=2.5'), config).page).toBe(1);
  });
});

describe('listStateQuery', () => {
  it('omite o valor padrão e mantém os outros parâmetros da URL', () => {
    expect(
      listStateQuery(params('outro=1&ordem=title&pagina=2'), config, {
        sort: { id: 'updatedAt', desc: true },
        page: 1,
      }),
    ).toBe('outro=1');
    expect(listStateQuery(params('q=guia'), config, { search: '' })).toBe('');
  });

  it('grava ordem decrescente com "-" e ignora filtro com valor fora da lista', () => {
    expect(listStateQuery(params(''), config, { sort: { id: 'title', desc: true } })).toBe(
      'ordem=-title',
    );
    expect(listStateQuery(params(''), config, { filters: { kind: 'video' } })).toBe('');
  });

  it('mudar a busca ou um filtro volta à página 1; mudar a ordem não', () => {
    expect(listStateQuery(params('pagina=4'), config, { search: 'guia' })).toBe('q=guia');
    expect(listStateQuery(params('pagina=4'), config, { filters: { kind: 'page' } })).toBe(
      'tipo=page',
    );
    expect(listStateQuery(params('pagina=4'), config, { sort: { id: 'title', desc: false } })).toBe(
      'pagina=4&ordem=title',
    );
  });
});

describe('useListState', () => {
  it('lê o estado da URL e entrega o formato do TanStack', () => {
    navigation.search = 'q=guia&tipo=page&ordem=title&pagina=2';
    const { result } = renderHook(() => useListState(config));

    expect(result.current.table.state).toEqual({
      globalFilter: 'guia',
      columnFilters: [{ id: 'kind', value: 'page' }],
      sorting: [{ id: 'title', desc: false }],
      pagination: { pageIndex: 1, pageSize: PAGE_SIZE },
    });
  });

  it('grava com router.replace, sem rolar, e nunca com push', () => {
    navigation.search = 'pagina=3';
    const { result } = renderHook(() => useListState(config));

    act(() => result.current.setSearch('ação'));

    expect(navigation.replace).toHaveBeenCalledWith('/sites/exemplo-a/conteudos?q=a%C3%A7%C3%A3o', {
      scroll: false,
    });
  });

  it('limpar filtros tira a busca e os filtros e mantém a ordem', () => {
    navigation.search = 'q=guia&tipo=page&status=rascunho&ordem=title&pagina=2';
    const { result } = renderHook(() => useListState(config));

    act(() => result.current.clearFilters());

    expect(navigation.replace).toHaveBeenCalledWith('/sites/exemplo-a/conteudos?ordem=title', {
      scroll: false,
    });
  });

  it('as mudanças do TanStack (ordem e página) viram parâmetros', () => {
    const { result } = renderHook(() => useListState(config));

    act(() => result.current.table.onSortingChange([{ id: 'title', desc: true }]));
    act(() =>
      result.current.table.onPaginationChange((old) => ({ ...old, pageIndex: old.pageIndex + 1 })),
    );

    expect(navigation.replace.mock.calls.map(([url]) => String(url))).toEqual([
      '/sites/exemplo-a/conteudos?ordem=-title',
      '/sites/exemplo-a/conteudos?pagina=2',
    ]);
  });
});
