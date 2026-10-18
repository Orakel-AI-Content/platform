'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { useMemo, type ReactNode } from 'react';

import { EmptyState } from '@/components/empty-state';
import { ListPagination, ListToolbar } from '@/components/list-controls.tsx';
import { listFeatures, useListState, type ListConfig } from '@/components/list-state.ts';
import { Button } from '@/components/ui/Button';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import Table from '@/components/ui/Table';

/** Linha de uma lista de entidades: o servidor já formata as células como texto. */
export type EntityRow = { id: number; name: string; cells: string[] };

type Noun = { one: string; many: string; none: string };

/** Busca por nome e paginação (#108): o rótulo da busca e a mensagem sem resultado. */
export type EntitySearch = { label: string; notFound: string };

type EntityTableProps = {
  /** `/sites/<site>/autores`: a edição é `<basePath>/<id>`. */
  basePath: string;
  /** Rótulo do nome e das demais células, na ordem. */
  headers: [string, ...string[]];
  rows: EntityRow[];
  noun: Noun;
  canWrite?: boolean;
  /** Ação principal da tela (criar), repetida no estado vazio; só com permissão. */
  emptyAction?: ReactNode;
  /** Liga a busca por nome e a paginação, com o estado na URL; sem ela, a lista inteira. */
  search?: EntitySearch;
};

// TanStack Table 9: na lista simples, só o modelo de linhas básico.
const features = tableFeatures({});
const column = createColumnHelper<typeof features, EntityRow>();
const listColumn = createColumnHelper<typeof listFeatures, EntityRow>();
const { THead, TBody, Tr, Th, Td } = Table;

/** Só busca (`q`) e página: sem filtros, sem ordenação, na ordem do servidor. */
const LIST: ListConfig = { filters: [], sortable: [] };

/**
 * Lista de autores, taxonomias ou menus. Editar só aparece com `canWrite` (content.write,
 * decidido no servidor); criar é a ação do cabeçalho da página, repetida no estado vazio.
 * O domínio confere de novo ao gravar. Com `search`, busca por nome e paginação (#108).
 */
export function EntityTable({ search, ...props }: EntityTableProps) {
  if (props.rows.length === 0) {
    return <EmptyState action={props.emptyAction}>{props.noun.none}</EmptyState>;
  }
  return search ? (
    <SearchableEntityTable search={search} {...props} />
  ) : (
    <PlainEntityTable {...props} />
  );
}

function PlainEntityTable({ headers, rows, noun, ...markup }: Omit<EntityTableProps, 'search'>) {
  const [nameHeader, ...rest] = headers;
  const columns = column.columns([
    column.accessor('name', { header: nameHeader }),
    ...rest.map((header, index) =>
      column.accessor((row) => row.cells[index] ?? '', { id: `cell-${index}`, header }),
    ),
  ]);
  const table = useTable({ features, columns, data: rows });
  return (
    <EntityRowsTable
      headers={headers}
      rows={table.getRowModel().rows.map((row) => row.original)}
      caption={rows.length === 1 ? `1 ${noun.one}` : `${rows.length} ${noun.many}`}
      {...markup}
    />
  );
}

function SearchableEntityTable({
  headers,
  rows,
  search,
  ...markup
}: Omit<EntityTableProps, 'search' | 'noun'> & { search: EntitySearch }) {
  const list = useListState(LIST);
  const columns = useMemo(() => {
    const [nameHeader, ...rest] = headers;
    return listColumn.columns([
      listColumn.accessor('name', { header: nameHeader }),
      ...rest.map((header, index) =>
        listColumn.accessor((row) => row.cells[index] ?? '', {
          id: `cell-${index}`,
          header,
          enableGlobalFilter: false,
        }),
      ),
    ]);
  }, [headers]);
  const table = useTable({ features: listFeatures, columns, data: rows, ...list.table });
  const found = table.getPrePaginatedRowModel().rows.length;
  return (
    <div className="space-y-4">
      <ListToolbar
        search={list.state.search}
        searchLabel={search.label}
        onSearchChange={list.setSearch}
        onClear={list.clearFilters}
      />
      {found === 0 ? (
        <EmptyState
          action={
            <Button type="button" onClick={list.clearFilters}>
              Limpar busca
            </Button>
          }
        >
          {search.notFound}
        </EmptyState>
      ) : (
        <EntityRowsTable
          headers={headers}
          rows={table.getRowModel().rows.map((row) => row.original)}
          {...markup}
        />
      )}
      <ListPagination
        total={found}
        page={list.state.page}
        pageCount={table.getPageCount()}
        onPageChange={list.setPage}
      />
    </div>
  );
}

/** A tabela em si: cabeçalhos, células já formatadas e o link de editar com permissão. */
function EntityRowsTable({
  basePath,
  headers,
  rows,
  canWrite = false,
  caption,
}: Pick<EntityTableProps, 'basePath' | 'headers' | 'rows' | 'canWrite'> & { caption?: string }) {
  return (
    <Table compact>
      {caption && <caption className="mt-4 caption-bottom text-sm">{caption}</caption>}
      <THead>
        <Tr>
          {headers.map((header) => (
            <Th key={header}>{header}</Th>
          ))}
          {canWrite && (
            <Th>
              <span className="sr-only">Ações</span>
            </Th>
          )}
        </Tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>{row.name}</Td>
            {headers.slice(1).map((header, index) => (
              <Td key={header}>{row.cells[index] ?? ''}</Td>
            ))}
            {canWrite && (
              <Td>
                <ButtonLink href={`${basePath}/${row.id}`} size="xs">
                  Editar
                  <span className="sr-only"> {row.name}</span>
                </ButtonLink>
              </Td>
            )}
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
