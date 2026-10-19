import type { ColumnSort } from '@tanstack/react-table';

// Estado das listas na URL (`q`, `ordem`, `pagina`, `por-pagina` e os filtros), sem React nem
// `'use client'`:
// a leitura serve ao servidor (a página Mídia pagina no servidor, #186) e ao cliente
// (`useListState`, em `useListState.ts`).

/** Itens por página de toda lista sem `pageSizes` (decisão da #35; com o seletor do DataTable
 * do Ecme, a lista que optar por ele escolhe entre os seus tamanhos, #215). */
export const PAGE_SIZE = 25;

/** Filtro de uma coluna: o parâmetro da URL e os valores aceitos (o resto é ignorado). */
export type ListFilterConfig = { column: string; param: string; values: readonly string[] };

export type ListConfig = {
  filters: readonly ListFilterConfig[];
  /** Colunas que aceitam ordenação; `ordem` fora delas cai na padrão. */
  sortable: readonly string[];
  /** Sem ordem padrão (e sem `sortable`), a tabela fica na ordem dos dados. */
  defaultSort?: ColumnSort;
  /**
   * Tamanhos aceitos em `por-pagina` (o seletor do DataTable). Sem a lista, o tamanho fica em
   * `PAGE_SIZE` e o parâmetro é ignorado; com ela, `PAGE_SIZE` continua o padrão.
   */
  pageSizes?: readonly number[];
};

export type ListState = {
  search: string;
  /** Valor de cada filtro ativo, pela coluna. */
  filters: Record<string, string>;
  /** `undefined`: a ordem dos dados. */
  sort: ColumnSort | undefined;
  /** Página a partir de 1. */
  page: number;
  /** Itens por página: `PAGE_SIZE` ou um dos `pageSizes`. */
  pageSize: number;
};

export type ListPatch = {
  search?: string;
  /** `undefined` (ou vazio) remove o filtro da coluna. */
  filters?: Record<string, string | undefined>;
  sort?: ColumnSort;
  page?: number;
  /** Fora dos `pageSizes`, volta ao padrão; mudar o tamanho volta à página 1. */
  pageSize?: number;
};

const SEARCH = 'q';
const SORT = 'ordem';
const PAGE = 'pagina';
const PAGE_SIZE_PARAM = 'por-pagina';

/** Estado da lista a partir dos `searchParams`; parâmetro inválido cai no padrão. */
export function parseListState(params: URLSearchParams, config: ListConfig): ListState {
  const filters: Record<string, string> = {};
  for (const filter of config.filters) {
    const value = params.get(filter.param);
    if (value !== null && filter.values.includes(value)) filters[filter.column] = value;
  }
  const sortParam = params.get(SORT) ?? '';
  const desc = sortParam.startsWith('-');
  const sortColumn = desc ? sortParam.slice(1) : sortParam;
  const sort = config.sortable.includes(sortColumn)
    ? { id: sortColumn, desc }
    : config.defaultSort && { ...config.defaultSort };
  const page = Number(params.get(PAGE));
  const pageSize = Number(params.get(PAGE_SIZE_PARAM));
  return {
    search: params.get(SEARCH) ?? '',
    filters,
    sort,
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: config.pageSizes?.includes(pageSize) ? pageSize : PAGE_SIZE,
  };
}

/**
 * Query string com a mudança aplicada; os demais parâmetros da URL ficam. Valor padrão sai
 * do endereço, e mudar a busca, um filtro ou o tamanho volta à página 1.
 */
export function listStateQuery(params: URLSearchParams, config: ListConfig, patch: ListPatch) {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | undefined) => {
    if (value === undefined || value === '') next.delete(key);
    else next.set(key, value);
  };
  if (patch.search !== undefined) set(SEARCH, patch.search);
  for (const [column, value] of Object.entries(patch.filters ?? {})) {
    const filter = config.filters.find((candidate) => candidate.column === column);
    if (filter)
      set(filter.param, value !== undefined && filter.values.includes(value) ? value : '');
  }
  if (patch.sort !== undefined) {
    const { id, desc } = patch.sort;
    const isDefault = id === config.defaultSort?.id && desc === config.defaultSort.desc;
    set(SORT, isDefault ? undefined : `${desc ? '-' : ''}${id}`);
  }
  if (patch.pageSize !== undefined) {
    const valid = patch.pageSize !== PAGE_SIZE && config.pageSizes?.includes(patch.pageSize);
    set(PAGE_SIZE_PARAM, valid ? String(patch.pageSize) : undefined);
  }
  if (patch.page !== undefined) set(PAGE, patch.page > 1 ? String(patch.page) : undefined);
  else if (
    patch.search !== undefined ||
    patch.filters !== undefined ||
    patch.pageSize !== undefined
  )
    next.delete(PAGE);
  return next.toString();
}
