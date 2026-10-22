'use client';

import { useId, useRef, useState } from 'react';
import { TbSearch } from 'react-icons/tb';

import { Button } from '@/components/ui/Button';
import { FormItem } from '@/components/ui/Form';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

// Toolbar das listas filtradas no cliente (#106): busca e filtros. O estado é de
// `useListState` (URL); aqui só a interface, nos componentes do Ecme (#269). Cabeçalho
// ordenável, contagem e paginação são do `DataTable` (#367).

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
 * daqui ou de fora. "Limpar filtros" só aparece com busca ou filtro ativo, é a única ação de
 * limpar da lista (o estado sem resultado não a repete, #361) e devolve o foco à busca. A lupa
 * é sufixo decorativo, como no `CustomerListSearch` (#442); o nome vem do rótulo. Layout
 * do `CustomersListTableTools` do Ecme: em coluna abaixo de `md`, em linha a partir dele, com
 * a busca à esquerda e filtros e limpar à direita.
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
      className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
      onSubmit={(event) => event.preventDefault()}
    >
      <FormItem htmlFor={`${id}-search`} label={searchLabel} className="mb-0 w-full md:max-w-xs">
        <Input
          ref={searchRef}
          id={`${id}-search`}
          type="search"
          suffix={<TbSearch className="text-lg" aria-hidden />}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            onSearchChange(event.target.value);
          }}
        />
      </FormItem>
      {(filters.length > 0 || active) && (
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          {filters.map((filter) => {
            const options = [ALL, ...filter.options];
            return (
              <FormItem
                key={filter.column}
                htmlFor={`${id}-${filter.column}`}
                label={filter.label}
                className="mb-0 md:w-44"
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
        </div>
      )}
    </form>
  );
}
