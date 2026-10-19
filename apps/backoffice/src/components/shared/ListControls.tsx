'use client';

import { useId, useRef, useState, type ComponentProps } from 'react';

import { Button } from '@/components/ui/Button';
import { FormItem } from '@/components/ui/Form';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';
import Select from '@/components/ui/Select';
import Table from '@/components/ui/Table';

// Controles das listas filtradas no cliente (#106): busca e filtros, cabeçalho ordenável e
// paginação. O estado é de `useListState` (URL); aqui só a interface, nos componentes do Ecme
// (#269).

const { Th, Sorter } = Table;

export type ListFilterControl = {
  column: string;
  label: string;
  /** Valor ativo; `undefined` é "Todos". */
  value: string | undefined;
  options: readonly { value: string; label: string }[];
};

type FilterOption = { value: string; label: string };

const ALL: FilterOption = { value: '', label: 'Todos' };

/**
 * Busca e filtros da lista. A busca guarda o texto digitado localmente (a URL chega depois
 * de cada `router.replace`) e esvazia quando a busca da URL volta a vazia, venha a limpeza
 * daqui ou de fora (o "Limpar busca" do estado sem resultado). "Limpar filtros" só aparece
 * com busca ou filtro ativo e devolve o foco à busca.
 */
export function ListToolbar({
  search,
  searchLabel,
  onSearchChange,
  filters = [],
  onFilterChange,
  onClear,
}: {
  search: string;
  /** Rótulo visível da busca, com o que ela procura ("Buscar por título"). */
  searchLabel: string;
  onSearchChange: (search: string) => void;
  filters?: readonly ListFilterControl[];
  onFilterChange?: (column: string, value: string | undefined) => void;
  onClear: () => void;
}) {
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(search);
  const [previous, setPrevious] = useState(search);
  if (search !== previous) {
    setPrevious(search);
    if (search === '') setText('');
  }
  const active = search !== '' || filters.some((filter) => filter.value !== undefined);

  return (
    <form
      role="search"
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => event.preventDefault()}
    >
      <FormItem htmlFor={`${id}-search`} label={searchLabel} className="mb-0 min-w-56 flex-1">
        <Input
          ref={searchRef}
          id={`${id}-search`}
          type="search"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            onSearchChange(event.target.value);
          }}
        />
      </FormItem>
      {filters.map((filter) => {
        const options = [ALL, ...filter.options];
        return (
          <FormItem
            key={filter.column}
            htmlFor={`${id}-${filter.column}`}
            label={filter.label}
            className="mb-0 min-w-44"
          >
            <Select<FilterOption>
              inputId={`${id}-${filter.column}`}
              isSearchable={false}
              options={options}
              value={options.find((option) => option.value === (filter.value ?? '')) ?? ALL}
              onChange={(option) => onFilterChange?.(filter.column, option?.value || undefined)}
            />
          </FormItem>
        );
      })}
      {active && (
        <Button
          type="button"
          onClick={() => {
            onClear();
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
        >
          Limpar filtros
        </Button>
      )}
    </form>
  );
}

const SORT_TEXT = { asc: 'ordem crescente', desc: 'ordem decrescente' } as const;

/**
 * Cabeçalho ordenável: `aria-sort` no `th` (o `sort` do `Th`) e um botão (clique, Enter ou
 * Espaço) que alterna o sentido. O sentido também vai no nome do botão, para o leitor de tela
 * anunciar a troca; o `Sorter` é só o ícone.
 */
export function SortableHead({
  label,
  direction,
  onToggle,
  className,
  ...props
}: Omit<ComponentProps<'th'>, 'children'> & {
  label: string;
  direction: false | 'asc' | 'desc';
  onToggle: () => void;
}) {
  return (
    <Th
      sort={direction || 'none'}
      className={className ?? 'h-10 px-3 text-left align-middle font-medium whitespace-nowrap'}
      {...props}
    >
      <button
        type="button"
        className="-mx-1 inline-flex min-h-6 items-center gap-1 rounded px-1 font-medium"
        onClick={onToggle}
      >
        {label}
        <Sorter sort={direction || true} />
        <span className="sr-only">{direction ? `, ${SORT_TEXT[direction]}` : ', sem ordem'}</span>
      </button>
    </Th>
  );
}

const count = new Intl.NumberFormat('pt-BR');

/**
 * Contagem de resultados (anunciada em `role="status"`), "Página X de Y" e a `Pagination` do
 * Ecme, que já é o `nav "Paginação"` (Página anterior e Próxima página desabilitados nas
 * pontas, `aria-current="page"` na atual). `page` começa em 1.
 */
export function ListPagination({
  total,
  page,
  pageCount,
  onPageChange,
}: {
  total: number;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(pageCount, 1);
  const current = Math.min(page, pages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm tabular-nums">
        {total === 1 ? '1 resultado' : `${count.format(total)} resultados`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm tabular-nums">
          Página {current} de {pages}
        </span>
        <Pagination total={pages} pageSize={1} currentPage={current} onChange={onPageChange} />
      </div>
    </div>
  );
}
