'use client';

import { useId, useRef, useState, type ComponentProps } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TableHead } from '@/components/ui/table';

// Controles das listas filtradas no cliente (#106): busca e filtros, cabeçalho ordenável e
// paginação. O estado é de `useListState` (URL); aqui só a interface.

const SELECT_CLASS = 'flex min-h-9 rounded-md border border-border bg-background px-3 py-1 text-sm';

export type ListFilterControl = {
  column: string;
  label: string;
  /** Valor ativo; `undefined` é "Todos". */
  value: string | undefined;
  options: readonly { value: string; label: string }[];
};

/**
 * Busca e filtros da lista. A busca guarda o texto digitado localmente (a URL chega depois
 * de cada `router.replace`) e é recriada ao limpar. "Limpar filtros" só aparece com busca ou
 * filtro ativo e devolve o foco à busca.
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
  const [resets, setResets] = useState(0);
  const active = search !== '' || filters.some((filter) => filter.value !== undefined);

  return (
    <form
      role="search"
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="min-w-56 flex-1 space-y-1.5">
        <Label htmlFor={`${id}-search`}>{searchLabel}</Label>
        <Input
          key={resets}
          ref={searchRef}
          id={`${id}-search`}
          type="search"
          defaultValue={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      {filters.map((filter) => (
        <div key={filter.column} className="space-y-1.5">
          <Label htmlFor={`${id}-${filter.column}`}>{filter.label}</Label>
          <select
            id={`${id}-${filter.column}`}
            className={SELECT_CLASS}
            value={filter.value ?? ''}
            onChange={(event) => onFilterChange?.(filter.column, event.target.value || undefined)}
          >
            <option value="">Todos</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      {active && (
        <Button
          variant="outline"
          onClick={() => {
            onClear();
            setResets((count) => count + 1);
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
        >
          Limpar filtros
        </Button>
      )}
    </form>
  );
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;
const SORT_TEXT = { asc: 'ordem crescente', desc: 'ordem decrescente' } as const;
const SORT_ARROW = { asc: '↑', desc: '↓' } as const;

/**
 * Cabeçalho ordenável: `aria-sort` no `th` e um botão (clique, Enter ou Espaço) que alterna o
 * sentido. O sentido também vai no nome do botão, para o leitor de tela anunciar a troca.
 */
export function SortableHead({
  label,
  direction,
  onToggle,
  ...props
}: Omit<ComponentProps<'th'>, 'children'> & {
  label: string;
  direction: false | 'asc' | 'desc';
  onToggle: () => void;
}) {
  return (
    <TableHead aria-sort={direction ? ARIA_SORT[direction] : 'none'} {...props}>
      <button
        type="button"
        className="-mx-1 inline-flex items-center gap-1 rounded px-1 font-medium"
        onClick={onToggle}
      >
        {label}
        <span aria-hidden="true" className="text-muted-foreground">
          {direction ? SORT_ARROW[direction] : '↕'}
        </span>
        <span className="sr-only">{direction ? `, ${SORT_TEXT[direction]}` : ', sem ordem'}</span>
      </button>
    </TableHead>
  );
}

const count = new Intl.NumberFormat('pt-BR');

/**
 * Contagem de resultados (anunciada em `role="status"`) e Anterior/Próxima, desabilitados
 * nas pontas. `page` começa em 1.
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
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm text-muted-foreground tabular-nums">
        {total === 1 ? '1 resultado' : `${count.format(total)} resultados`}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm tabular-nums">
          Página {Math.min(page, pages)} de {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima
        </Button>
      </div>
    </nav>
  );
}
