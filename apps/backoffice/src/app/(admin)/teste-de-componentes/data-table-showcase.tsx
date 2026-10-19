'use client';

import { useMemo } from 'react';

import { useListState, type ListConfig } from '@/components/shared/useListState';
import DataTable, { type ColumnDef, type OnSortParam } from '@/components/shared/DataTable';
import { Card } from '@/components/ui/Card';

// Seção do DataTable na vitrine (#215), com nomes que não colidem com os da Table: dados fixos paginados e ordenados por quem usa, como
// no Ecme (manual), com página, ordem e tamanho na URL pelo `useListState`; e os estados de
// carregamento (TableRowSkeleton) e de lista vazia.

type Materia = { id: number; titulo: string; visitas: number; status: string };

const STATUS = ['Publicado', 'Rascunho', 'Em revisão'];

/** 32 matérias fixas: duas páginas no tamanho 25 e quatro no 10. */
const MATERIAS: Materia[] = Array.from({ length: 32 }, (_, i) => ({
  id: i + 1,
  titulo: `Matéria ${String(i + 1).padStart(2, '0')}`,
  visitas: ((i * 37) % 97) * 10,
  status: STATUS[i % STATUS.length] ?? 'Rascunho',
}));

const COLUNAS: ColumnDef<Materia>[] = [
  { header: 'Manchete', accessorKey: 'titulo' },
  { header: 'Visitas', accessorKey: 'visitas' },
  { header: 'Situação', accessorKey: 'status', enableSorting: false },
];

const PAGE_SIZES = [10, 25, 50];

const LIST: ListConfig = {
  filters: [],
  sortable: ['titulo', 'visitas'],
  defaultSort: { id: 'titulo', desc: false },
  pageSizes: PAGE_SIZES,
};

const DEFAULT_SORT = { id: 'titulo', desc: false };

function compare(a: Materia, b: Materia, column: string): number {
  return column === 'visitas' ? a.visitas - b.visitas : a.titulo.localeCompare(b.titulo, 'pt-BR');
}

export function DataTableShowcase() {
  const list = useListState(LIST);
  const { page, pageSize } = list.state;
  const sort = list.state.sort ?? DEFAULT_SORT;

  const rows = useMemo(() => {
    const sorted = [...MATERIAS].sort((a, b) => (sort.desc ? -1 : 1) * compare(a, b, sort.id));
    return sorted.slice((page - 1) * pageSize, page * pageSize);
  }, [sort.id, sort.desc, page, pageSize]);

  const onSort = ({ order, key }: OnSortParam) =>
    list.setSort(order ? { id: String(key), desc: order === 'desc' } : DEFAULT_SORT);

  return (
    <section aria-labelledby="vitrine-data-table" className="space-y-3">
      <h2 id="vitrine-data-table" className="text-lg font-semibold">
        DataTable
      </h2>
      <Card>
        <DataTable
          aria-label="Matérias paginadas"
          instanceId="vitrine-data-table"
          columns={COLUNAS}
          data={rows}
          sort={{ order: sort.desc ? 'desc' : 'asc', key: sort.id }}
          pageSizes={PAGE_SIZES}
          pagingData={{ total: MATERIAS.length, pageIndex: page, pageSize }}
          onSort={onSort}
          onPaginationChange={list.setPage}
          onSelectChange={list.setPageSize}
        />
      </Card>
      <Card>
        <DataTable
          aria-label="Matérias carregando"
          instanceId="vitrine-data-table-carregando"
          columns={COLUNAS}
          loading
          pageSizes={PAGE_SIZES}
          pagingData={{ total: 0, pageIndex: 1, pageSize: 10 }}
        />
      </Card>
      <Card>
        <DataTable
          aria-label="Matérias vazias"
          instanceId="vitrine-data-table-vazio"
          columns={COLUNAS}
          data={[]}
          noData
          pageSizes={PAGE_SIZES}
          pagingData={{ total: 0, pageIndex: 1, pageSize: 10 }}
        />
      </Card>
    </section>
  );
}
