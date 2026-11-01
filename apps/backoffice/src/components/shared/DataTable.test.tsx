// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DataTable, { type ColumnDef, type DataTableResetHandle } from './DataTable.tsx';

// DataTable do Ecme (#215): ordenação e paginação controladas por quem usa (manual), cabeçalho
// ordenável como botão com aria-sort, esqueleto ao carregar, vazio com mensagem e o seletor de
// tamanho de página.

afterEach(cleanup);

type Artigo = { titulo: string; status: string };

const ARTIGOS: Artigo[] = [
  { titulo: 'Guia de jardinagem', status: 'Publicado' },
  { titulo: 'Análise do mercado', status: 'Rascunho' },
  { titulo: 'Receita de pão', status: 'Em revisão' },
];

const COLUNAS: ColumnDef<Artigo>[] = [
  { header: 'Título', accessorKey: 'titulo' },
  { header: 'Status', accessorKey: 'status', enableSorting: false },
];

const paging = { total: 30, pageIndex: 1, pageSize: 10 };

const rowTexts = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

describe('DataTable', () => {
  it('renderiza as linhas dos dados, na ordem recebida (ordenação manual)', () => {
    render(<DataTable aria-label="Artigos" columns={COLUNAS} data={ARTIGOS} pagingData={paging} />);

    expect(screen.getByRole('table', { name: 'Artigos' })).toBeTruthy();
    expect(rowTexts()).toEqual(['Guia de jardinagem', 'Análise do mercado', 'Receita de pão']);
  });

  it('só a coluna ordenável tem botão e aria-sort; o clique avisa onSort', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(<DataTable columns={COLUNAS} data={ARTIGOS} pagingData={paging} onSort={onSort} />);

    const [titulo, status] = screen.getAllByRole('columnheader');
    expect(titulo?.getAttribute('aria-sort')).toBe('none');
    expect(status?.hasAttribute('aria-sort')).toBe(false);
    expect(within(status!).queryByRole('button')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Título' }));
    expect(onSort).toHaveBeenLastCalledWith({ order: 'asc', key: 'titulo' });
    expect(titulo?.getAttribute('aria-sort')).toBe('ascending');
  });

  it('com `sort`, a ordenação é controlada: mostra a recebida e não muda sozinha', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={ARTIGOS}
        pagingData={paging}
        sort={{ order: 'desc', key: 'titulo' }}
        onSort={onSort}
      />,
    );

    const titulo = screen.getAllByRole('columnheader')[0];
    expect(titulo?.getAttribute('aria-sort')).toBe('descending');

    await user.click(screen.getByRole('button', { name: 'Título' }));
    expect(onSort).toHaveBeenLastCalledWith({ order: '', key: '' });
    expect(titulo?.getAttribute('aria-sort')).toBe('descending');
  });

  it('carregando sem dados, mostra o TableRowSkeleton com pageSize linhas e aria-busy', () => {
    const { container } = render(
      <DataTable
        aria-label="Artigos"
        columns={COLUNAS}
        loading
        pagingData={{ total: 0, pageIndex: 1, pageSize: 5 }}
      />,
    );

    const table = screen.getByRole('table', { name: 'Artigos' });
    expect(table.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(container.querySelectorAll('tbody td .skeleton')).toHaveLength(10);
  });

  it('noData mostra a mensagem e a ilustração decorativa; customNoDataIcon a substitui', () => {
    const { rerender, container } = render(
      <DataTable columns={COLUNAS} data={[]} noData pagingData={paging} />,
    );

    expect(screen.getByText('Nenhum dado encontrado!')).toBeTruthy();
    expect(container.querySelector('tbody svg')?.getAttribute('aria-hidden')).toBe('true');

    rerender(
      <DataTable
        columns={COLUNAS}
        data={[]}
        noData
        pagingData={paging}
        customNoDataIcon={<p>Nada por aqui.</p>}
      />,
    );
    expect(screen.getByText('Nada por aqui.')).toBeTruthy();
    expect(screen.queryByText('Nenhum dado encontrado!')).toBeNull();
  });

  it('mostra a contagem em role="status" com tabular-nums, junto da paginação (#361)', () => {
    const { rerender } = render(
      <DataTable columns={COLUNAS} data={ARTIGOS} pagingData={{ ...paging, total: 1250 }} />,
    );

    const status = screen.getByRole('status');
    expect(status.textContent).toBe('1.250 resultados');
    expect(status.className).toContain('tabular-nums');
    const footer = status.closest('div.mt-4');
    expect(footer?.querySelector('nav[aria-label="Paginação"]')).toBeTruthy();
    expect(within(footer as HTMLElement).getByLabelText('Itens por página')).toBeTruthy();

    rerender(<DataTable columns={COLUNAS} data={ARTIGOS} pagingData={{ ...paging, total: 1 }} />);
    expect(screen.getByRole('status').textContent).toBe('1 resultado');

    rerender(<DataTable columns={COLUNAS} data={[]} noData pagingData={{ ...paging, total: 0 }} />);
    expect(screen.getByRole('status').textContent).toBe('0 resultados');
  });

  it('carregando sem dados, a contagem fica vazia', () => {
    render(
      <DataTable columns={COLUNAS} loading pagingData={{ total: 0, pageIndex: 1, pageSize: 5 }} />,
    );

    expect(
      screen.getAllByRole('status').find((element) => element.tagName === 'P')?.textContent,
    ).toBe('');
  });

  it('a Pagination usa pagingData e avisa onPaginationChange', async () => {
    const user = userEvent.setup();
    const onPaginationChange = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={ARTIGOS}
        pagingData={{ total: 30, pageIndex: 2, pageSize: 10 }}
        onPaginationChange={onPaginationChange}
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Paginação' });
    expect(within(nav).getByRole('button', { name: 'Página 2' }).getAttribute('aria-current')).toBe(
      'page',
    );
    await user.click(within(nav).getByRole('button', { name: 'Página 3' }));
    expect(onPaginationChange).toHaveBeenLastCalledWith(3);
  });

  it('seletor "Itens por página" mostra o tamanho atual e avisa onSelectChange', async () => {
    const user = userEvent.setup();
    const onSelectChange = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={ARTIGOS}
        pagingData={{ total: 30, pageIndex: 1, pageSize: 25 }}
        pageSizes={[10, 25, 50]}
        onSelectChange={onSelectChange}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Itens por página' });
    expect(screen.getByText('25 / página')).toBeTruthy();
    await user.click(select);
    await user.click(screen.getByRole('option', { name: '50 / página' }));
    expect(onSelectChange).toHaveBeenLastCalledWith(50);
  });

  it('carregando com dados, ignora a troca de página e mantém o conteúdo coberto', async () => {
    const user = userEvent.setup();
    const onPaginationChange = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={ARTIGOS}
        loading
        pagingData={paging}
        onPaginationChange={onPaginationChange}
      />,
    );

    expect(screen.getAllByRole('status').map((element) => element.textContent)).toContain(
      'Carregando…',
    );
    expect(rowTexts()).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Página 2' }));
    expect(onPaginationChange).not.toHaveBeenCalled();
  });

  it('selectable: caixas com nome, onCheckBoxChange e resetSelected pela ref', async () => {
    const user = userEvent.setup();
    const onCheckBoxChange = vi.fn();
    const ref = createRef<DataTableResetHandle>();
    render(
      <DataTable
        ref={ref}
        columns={COLUNAS}
        data={ARTIGOS}
        pagingData={paging}
        selectable
        onCheckBoxChange={onCheckBoxChange}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Selecionar todas as linhas' })).toBeTruthy();
    const linhas = screen.getAllByRole('checkbox', { name: 'Selecionar linha' });
    expect(linhas).toHaveLength(3);
    await user.click(linhas[0]!);
    expect(onCheckBoxChange).toHaveBeenLastCalledWith(true, ARTIGOS[0]);
    expect(ref.current?.resetSelected).toBeTypeOf('function');
    expect(ref.current?.resetSorting).toBeTypeOf('function');
  });

  it('rowSelectable: só as linhas escolhíveis têm caixa, com o nome de checkboxLabel (#495)', async () => {
    const user = userEvent.setup();
    const onIndeterminateCheckBoxChange = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={ARTIGOS}
        pagingData={paging}
        selectable
        rowSelectable={(artigo) => artigo.status !== 'Rascunho'}
        checkboxLabel={(artigo) => `Selecionar ${artigo.titulo}`}
        onIndeterminateCheckBoxChange={onIndeterminateCheckBoxChange}
      />,
    );

    const caixas = screen.getAllByRole('checkbox');
    expect(caixas.map((caixa) => caixa.getAttribute('aria-label'))).toEqual([
      'Selecionar todas as linhas',
      'Selecionar Guia de jardinagem',
      'Selecionar Receita de pão',
    ]);
    const [, rascunho] = screen.getAllByRole('row').slice(1);
    expect(within(rascunho!).queryByRole('checkbox')).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar todas as linhas' }));
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Selecionar Guia de jardinagem' })
        .checked,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Selecionar Receita de pão' }).checked,
    ).toBe(true);
    expect(onIndeterminateCheckBoxChange).toHaveBeenLastCalledWith(true, expect.any(Array));
  });

  it('rowSelectable: cabeçalho desabilitado quando nenhuma linha da página pode ser escolhida', () => {
    render(
      <DataTable
        columns={COLUNAS}
        data={ARTIGOS}
        pagingData={paging}
        selectable
        rowSelectable={() => false}
      />,
    );

    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Selecionar todas as linhas' })
        .disabled,
    ).toBe(true);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('seleção controlada: o indeterminado do cabeçalho sai de checkboxChecked', async () => {
    const user = userEvent.setup();
    function Controlada() {
      const [escolhidos, setEscolhidos] = useState<string[]>(['Guia de jardinagem']);
      return (
        <>
          <button type="button" onClick={() => setEscolhidos([])}>
            Limpar
          </button>
          <DataTable
            columns={COLUNAS}
            data={ARTIGOS}
            pagingData={paging}
            selectable
            checkboxChecked={(artigo) => escolhidos.includes(artigo.titulo)}
            onCheckBoxChange={(checked, artigo) =>
              setEscolhidos((atual) =>
                checked ? [...atual, artigo.titulo] : atual.filter((t) => t !== artigo.titulo),
              )
            }
          />
        </>
      );
    }
    render(<Controlada />);
    const cabecalho = () =>
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Selecionar todas as linhas' });

    expect(cabecalho().indeterminate).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(cabecalho().indeterminate).toBe(false);
  });
});
