'use client';

import Link from 'next/link';

import AdaptiveCard from '@/components/shared/AdaptiveCard';
import DataTable, { type ColumnDef } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls';
import { ROW_LINK_CLASS } from '@/components/shared/rowLink';
import { Truncated } from '@/components/shared/Truncated';
import { TwoLines } from '@/components/shared/TwoLines';
import { useListTable } from '@/components/shared/useListTable';
import type { ListConfig } from '@/components/shared/useListState';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import { Card } from '@/components/ui/Card';

// Seção do DataTable na vitrine (#215, #361), com nomes que não colidem com os da Table: a lista
// completa no padrão do template (`CustomerList` do Ecme) — cartão com título e ação principal,
// toolbar, tabela, contagem e paginação —, calculada no cliente pelo `useListTable` com busca,
// filtro, ordem, página e tamanho na URL; a lista vazia (com a ação principal) e o esqueleto
// de carregamento. Busca sem resultado é a própria lista com uma busca que não acha nada.

type Status = 'publicado' | 'rascunho' | 'revisao';

type Materia = { id: number; titulo: string; resumo: string; visitas: number; status: Status };

const STATUS_LABEL: Record<Status, string> = {
  publicado: 'Publicado',
  rascunho: 'Rascunho',
  revisao: 'Em revisão',
};

const STATUSES = Object.keys(STATUS_LABEL) as Status[];

/** 32 matérias fixas: duas páginas no tamanho 25 e quatro no 10. */
const MATERIAS: Materia[] = Array.from({ length: 32 }, (_, i) => ({
  id: i + 1,
  titulo: `Matéria ${String(i + 1).padStart(2, '0')}`,
  resumo: `Resumo longo da matéria ${i + 1}, cortado na célula com o texto inteiro no title`,
  visitas: ((i * 37) % 97) * 10,
  status: STATUSES[i % STATUSES.length] ?? 'rascunho',
}));

const COLUNAS: ColumnDef<Materia>[] = [
  {
    header: 'Manchete',
    accessorKey: 'titulo',
    sortFn: (a, b) => a.original.titulo.localeCompare(b.original.titulo, 'pt-BR'),
    cell: ({ row }) => (
      <TwoLines secondary={<Truncated text={row.original.resumo} className="max-w-48" />}>
        <Link href="#vitrine-data-table" className={ROW_LINK_CLASS}>
          {row.original.titulo}
        </Link>
      </TwoLines>
    ),
  },
  { header: 'Visitas', accessorKey: 'visitas', enableGlobalFilter: false },
  {
    header: 'Situação',
    accessorKey: 'status',
    enableSorting: false,
    enableGlobalFilter: false,
    filterFn: 'equalsString',
    cell: ({ row }) => STATUS_LABEL[row.original.status],
  },
];

const LIST: ListConfig = {
  filters: [{ column: 'status', param: 'situacao', values: STATUSES }],
  sortable: ['titulo', 'visitas'],
  defaultSort: { id: 'titulo', desc: false },
  pageSizes: [10, 25, 50],
};

const STATUS_OPTIONS = STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }));

const NOVA = (
  <ButtonLink variant="solid" href="#vitrine-data-table">
    Nova matéria
  </ButtonLink>
);

/** Cabeçalho do cartão da lista: título e ação principal, em linha a partir de `md`. */
function ListHeader({ id, title }: { id: string; title: string }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <h3 id={id} className="text-lg font-semibold">
        {title}
      </h3>
      {NOVA}
    </div>
  );
}

function MateriasList() {
  const { list, tableProps } = useListTable({ config: LIST, columns: COLUNAS, data: MATERIAS });
  return (
    <AdaptiveCard>
      <div className="flex flex-col gap-4">
        <ListHeader id="vitrine-data-table-materias" title="Matérias" />
        <ListToolbar
          search={list.state.search}
          searchLabel="Buscar por manchete"
          onSearchChange={list.setSearch}
          filters={[
            {
              column: 'status',
              label: 'Situação',
              value: list.state.filters.status,
              options: STATUS_OPTIONS,
            },
          ]}
          onFilterChange={list.setFilter}
          onClear={list.clearFilters}
        />
        <DataTable
          aria-labelledby="vitrine-data-table-materias"
          instanceId="vitrine-data-table"
          columns={COLUNAS}
          customNoDataIcon={<NoResults>Nenhuma matéria encontrada.</NoResults>}
          {...tableProps}
        />
      </div>
    </AdaptiveCard>
  );
}

export function DataTableShowcase() {
  return (
    <section aria-labelledby="vitrine-data-table" className="space-y-3">
      <h2 id="vitrine-data-table" className="text-lg font-semibold">
        DataTable
      </h2>
      <MateriasList />
      <AdaptiveCard>
        <div className="flex flex-col gap-4">
          <ListHeader id="vitrine-data-table-rascunhos" title="Rascunhos" />
          <EmptyState action={NOVA}>Nenhum rascunho cadastrado.</EmptyState>
        </div>
      </AdaptiveCard>
      <Card>
        <DataTable
          aria-label="Matérias carregando"
          instanceId="vitrine-data-table-carregando"
          columns={COLUNAS}
          loading
          pageSizes={[10, 25, 50]}
          pagingData={{ total: 0, pageIndex: 1, pageSize: 10 }}
        />
      </Card>
    </section>
  );
}
