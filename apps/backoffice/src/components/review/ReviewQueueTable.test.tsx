// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ReviewQueueEntry } from '@/domain/reviews/reviews.ts';

import type { ApproveBatch } from './ApproveBatchDialog.tsx';

import { ReviewQueueTable } from './ReviewQueueTable.tsx';

// Fila de revisão (#74): título, tipo, versão e data; links para a revisão e teclado.
// Pendências e a marca "Devolvido" de cada item (#772); "Correção automática" no lugar dela (#804).
// O resultado do parecer automático (#774). A seleção do lote, o resumo e o resultado (#776).
// Busca, filtro por tipo, ordem e paginação com o estado na URL (#365): router.replace simulado.

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
    usePathname: () => '/sites/exemplo-a/revisao',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(navigation.subscribe, navigation.get)),
    useRouter: () => ({ replace: (url: string) => navigation.set(url.split('?')[1] ?? '') }),
  };
});

afterEach(() => {
  cleanup();
  navigation.set('');
});

/** Sem pendência, links verificando, enviado pela primeira vez e parecer favorável. */
const fresh: Omit<ReviewQueueEntry, 'id' | 'kind' | 'title' | 'version' | 'submittedAt'> = {
  pending: 0,
  links: { state: 'verificando' },
  returned: false,
  autoCorrected: false,
  opinion: 'favoravel',
  batchBlockers: ['a checagem de links externos não terminou'],
};

const rows: ReviewQueueEntry[] = [
  {
    id: 3,
    kind: 'page',
    title: 'Quem somos',
    version: 2,
    submittedAt: new Date('2026-10-01T12:00:00Z'),
    ...fresh,
  },
  {
    id: 1,
    kind: 'article',
    title: 'Guia de uso',
    version: 4,
    submittedAt: new Date('2026-10-02T15:30:00Z'),
    ...fresh,
    pending: 3,
    returned: true,
  },
];

const renderTable = (data = rows, timeZone = 'America/Sao_Paulo') =>
  render(<ReviewQueueTable siteId="exemplo-a" timeZone={timeZone} rows={data} />);

// O filtro é o combobox do react-select: abre com a seta e escolhe a opção pelo nome.
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  screen.getByRole('combobox', { name: label }).focus();
  await user.keyboard('{ArrowDown}');
  await user.click(screen.getByRole('option', { name: option }));
}

describe('fila de revisão', () => {
  it('mostra título, tipo, versão e data de cada conteúdo, a mais antiga primeiro', () => {
    renderTable();

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Título',
      'Tipo',
      'Versão',
      'Pendências',
      'Parecer',
      'Enviado em',
    ]);
    const [, first, second] = screen.getAllByRole('row');
    expect(first?.textContent).toContain('Quem somos');
    expect(first?.textContent).toContain('Página');
    expect(first?.textContent).toContain('2');
    expect(first?.textContent).toContain('01/10/2026, 09:00 BRT');
    expect(second?.textContent).toContain('Guia de uso');
    expect(second?.textContent).toContain('Artigo');
    expect(screen.getByRole('status').textContent).toBe('2 resultados');
    expect(screen.getByRole('columnheader', { name: /Enviado em/ }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
  });

  it('o título leva à tela de revisão, com nome acessível, e o teclado alcança cada um', async () => {
    const user = userEvent.setup();
    renderTable();

    const first = screen.getByRole('link', { name: 'Quem somos (revisar)' });
    // Busca, filtro e cabeçalhos ordenáveis vêm antes: o Tab chega ao primeiro link.
    while (document.activeElement !== first) await user.tab();
    expect(first.getAttribute('href')).toBe('/sites/exemplo-a/revisao/3');
    expect(first.className).toContain('font-semibold');
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: 'Guia de uso (revisar)' }),
    );
  });

  it('mostra as pendências, ou "Nenhuma", e a marca "Devolvido" só no item devolvido (#772)', () => {
    renderTable();

    const [, first, second] = screen.getAllByRole('row');
    const pendingCell = (row: HTMLElement | undefined) =>
      within(row!).getAllByRole('cell')[3]?.textContent;
    expect(pendingCell(first)).toBe('Nenhuma');
    expect(pendingCell(second)).toBe('3');
    expect(within(first!).queryByText('Devolvido')).toBeNull();
    const titleCell = within(second!).getAllByRole('cell')[0]!;
    expect(within(titleCell).getByText('Devolvido')).toBeTruthy();
    // A marca fica fora do link: o nome acessível continua o do título.
    expect(screen.getByRole('link', { name: 'Guia de uso (revisar)' })).toBeTruthy();
  });

  it('mostra "Correção automática" no lugar de "Devolvido" só na versão corrigida (#804)', () => {
    renderTable([
      ...rows,
      {
        ...fresh,
        id: 5,
        kind: 'article',
        title: 'Receita corrigida',
        version: 3,
        submittedAt: new Date('2026-10-03T12:00:00Z'),
        returned: true,
        autoCorrected: true,
      },
    ]);

    const [, first, second, third] = screen.getAllByRole('row');
    expect(within(first!).queryByText('Correção automática')).toBeNull();
    expect(within(second!).queryByText('Correção automática')).toBeNull();
    expect(within(second!).getByText('Devolvido')).toBeTruthy();
    const titleCell = within(third!).getAllByRole('cell')[0]!;
    expect(within(titleCell).getByText('Correção automática')).toBeTruthy();
    expect(within(titleCell).queryByText('Devolvido')).toBeNull();
    expect(screen.getByRole('link', { name: 'Receita corrigida (revisar)' })).toBeTruthy();
  });

  it('mostra o resultado do parecer de cada item (#774)', () => {
    const outlooks = ['favoravel', 'com_ressalvas', 'pendente', 'falha', 'ausente'] as const;
    renderTable(
      outlooks.map((opinion, index) => ({
        ...fresh,
        id: index + 1,
        kind: 'article',
        title: `Artigo ${String(index + 1)}`,
        version: 1,
        submittedAt: new Date(Date.UTC(2026, 9, 1 + index)),
        opinion,
      })),
    );

    const opinionCells = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[4]?.textContent);
    expect(opinionCells).toEqual([
      'Favorável',
      'Com ressalvas',
      'Pendente',
      'Falhou',
      'Sem parecer',
    ]);
  });

  it('mostra o instante do envio no fuso do site (#771)', () => {
    renderTable(rows, 'Europe/Lisbon');

    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 13:00 GMT+1');
  });

  it('fila vazia mostra o estado vazio no lugar da tabela e da toolbar', () => {
    renderTable([]);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.getByText('Nenhum conteúdo aguardando revisão.')).toBeTruthy();
  });
});

const titles = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('link')[0]?.textContent?.replace(' (revisar)', ''));

const many: ReviewQueueEntry[] = Array.from({ length: 30 }, (_, index) => ({
  ...fresh,
  id: index + 10,
  kind: index % 3 === 0 ? 'page' : 'article',
  title: index === 0 ? 'Ação de graças' : `Receita ${String(index).padStart(2, '0')}`,
  version: (index % 4) + 1,
  // Mais recente quanto maior o índice.
  submittedAt: new Date(Date.UTC(2026, 8, 1 + index)),
}));

const renderMany = () =>
  render(<ReviewQueueTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={many} />);

describe('busca, filtro, ordem e paginação (#365)', () => {
  it('busca por palavra do título sem diferenciar maiúsculas e acentos', async () => {
    const user = userEvent.setup();
    renderMany();

    await user.type(screen.getByLabelText('Buscar por título'), 'ACAO');

    expect(titles()).toEqual(['Ação de graças']);
    expect(screen.getByRole('status').textContent).toBe('1 resultado');
    expect(navigation.get()).toBe('q=ACAO');
  });

  it('o filtro por tipo combina com a busca; "Limpar filtros" zera os dois', async () => {
    const user = userEvent.setup();
    renderMany();

    await choose(user, 'Tipo', 'Página');
    expect(screen.getByRole('status').textContent).toBe('10 resultados');
    expect(navigation.get()).toBe('tipo=page');
    await user.type(screen.getByLabelText('Buscar por título'), '2');
    expect(titles()).toEqual(['Receita 12', 'Receita 21', 'Receita 24', 'Receita 27']);

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    expect(navigation.get()).toBe('');
    expect(screen.getByRole('status').textContent).toBe('30 resultados');
  });

  it('título, tipo e versão ordenam; o tipo pelo rótulo exibido', async () => {
    const user = userEvent.setup();
    renderMany();
    const header = (name: RegExp) => screen.getByRole('columnheader', { name });

    await user.click(within(header(/Título/)).getByRole('button'));
    expect(header(/Título/).getAttribute('aria-sort')).toBe('ascending');
    expect(titles()[0]).toBe('Ação de graças');
    expect(navigation.get()).toBe('ordem=title');

    await user.click(within(header(/Tipo/)).getByRole('button'));
    const kinds = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[1]?.textContent);
    expect(kinds[0]).toBe('Artigo');
    expect(kinds.at(-1)).toBe('Página');

    // Número começa pelo maior (o padrão do TanStack para colunas numéricas).
    await user.click(within(header(/Versão/)).getByRole('button'));
    expect(header(/Versão/).getAttribute('aria-sort')).toBe('descending');
    expect(within(screen.getAllByRole('row')[1]!).getAllByRole('cell')[2]?.textContent).toBe('4');
  });

  it('25 por página, com contagem; o seletor de tamanho vai para a URL', async () => {
    const user = userEvent.setup();
    renderMany();

    expect(screen.getAllByRole('row')).toHaveLength(26);
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.getAllByRole('row')).toHaveLength(6);
    expect(navigation.get()).toBe('pagina=2');

    await choose(user, 'Itens por página', '10 / página');
    expect(navigation.get()).toContain('por-pagina=10');
  });

  it('a URL de uma lista filtrada e ordenada restaura o mesmo estado', () => {
    act(() => navigation.set('tipo=article&ordem=-submittedAt&q=receita'));
    renderMany();

    expect(screen.getByLabelText<HTMLInputElement>('Buscar por título').value).toBe('receita');
    expect(screen.getByRole('combobox', { name: 'Tipo' }).closest('.select')?.textContent).toBe(
      'Artigo',
    );
    expect(titles()[0]).toBe('Receita 29');
    expect(screen.getByRole('status').textContent).toBe('20 resultados');
  });

  it('busca sem resultado mantém a tabela com a mensagem e 0 resultados', async () => {
    const user = userEvent.setup();
    renderMany();

    await user.type(screen.getByLabelText('Buscar por título'), 'inexistente');

    expect(within(screen.getByRole('table')).getByText('Nenhum conteúdo encontrado.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('0 resultados');
  });

  it('título longo fica numa linha cortada, com o texto inteiro em title', () => {
    const title = 'Um título de conteúdo bem comprido, que não cabe na coluna da fila';
    renderTable([{ ...rows[0]!, title }]);

    const link = screen.getByRole('link', { name: `${title} (revisar)` });
    const text = within(link).getByText(title);
    expect(text.getAttribute('title')).toBe(title);
    expect(text.className).toContain('truncate');
  });
});

describe('lote de aprovar e publicar na fila (#776)', () => {
  // O happy-dom rejeita a animação nativa que o motion cancela ao desmontar o Dialog.
  beforeAll(() => {
    MotionGlobalConfig.skipAnimations = true;
  });
  afterAll(() => {
    MotionGlobalConfig.skipAnimations = false;
  });

  const clean = { ...fresh, links: { state: 'sem_links' }, batchBlockers: [] } as const;
  const batchRows: ReviewQueueEntry[] = [
    { ...rows[0]!, id: 1, title: 'Limpo A', version: 2, ...clean, batchBlockers: [] },
    {
      ...rows[0]!,
      id: 2,
      title: 'Com pendência',
      ...clean,
      pending: 2,
      batchBlockers: ['tem 2 pendência(s)'],
    },
    { ...rows[1]!, id: 3, title: 'Limpo B', version: 5, ...clean, batchBlockers: [] },
  ];
  const overflow =
    'O dia pedido já tinha atingido o limite diário de publicações do site; a publicação foi para o próximo dia com vaga, no mesmo horário.';
  const done: ApproveBatch = () =>
    Promise.resolve({
      ok: true,
      items: [
        { contentId: 1, outcome: 'published' },
        { contentId: 3, outcome: 'scheduled', at: '13/11/2026, 10:00 BRT', warning: overflow },
      ],
    });

  function renderBatch(action = vi.fn(done), canPublish = true) {
    render(
      <ReviewQueueTable
        siteId="exemplo-a"
        timeZone="UTC"
        rows={batchRows}
        canPublish={canPublish}
        approveBatchAction={action}
      />,
    );
    return action;
  }

  async function openSummary(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar todas as linhas' }));
    await user.click(screen.getByRole('button', { name: 'Aprovar e publicar selecionados' }));
    return screen.findByRole('dialog', { name: 'Aprovar e publicar 2 conteúdos?' });
  }

  it('sem content.publish a fila fica sem caixas nem barra', () => {
    renderBatch(vi.fn(done), false);

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Aprovar e publicar selecionados' })).toBeNull();
  });

  it('só os elegíveis têm a caixa habilitada; os outros dizem por que ficam fora do lote', () => {
    renderBatch();

    const boxes = screen.getAllByRole<HTMLInputElement>('checkbox');
    expect(boxes.map((box) => [box.getAttribute('aria-label'), box.disabled])).toEqual([
      ['Selecionar todas as linhas', false],
      ['Selecionar Limpo A', false],
      ['Selecionar Com pendência', true],
      ['Selecionar Limpo B', false],
    ]);
    const reason = document.getElementById(boxes[2]?.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe('Fora do lote: tem 2 pendência(s).');
    expect(screen.queryByRole('button', { name: 'Aprovar e publicar selecionados' })).toBeNull();
  });

  it('o resumo lista os títulos, e o envio só se habilita com a confirmação de leitura', async () => {
    const user = userEvent.setup();
    const action = renderBatch();

    expect(screen.queryByText('2 conteúdos selecionados')).toBeNull();
    const dialog = await openSummary(user);
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Limpo A', 'Limpo B']);
    const send = within(dialog).getByRole<HTMLButtonElement>('button', {
      name: 'Aprovar e publicar',
    });
    expect(send.disabled).toBe(true);

    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'Li os conteúdos selecionados e confirmo o checklist de cada um',
      }),
    );
    expect(send.disabled).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it('depois do envio, o resultado separa os que foram ao ar, os agendados e os que falharam', async () => {
    const user = userEvent.setup();
    const action = renderBatch(
      vi.fn<ApproveBatch>(() =>
        Promise.resolve({
          ok: true,
          items: [
            { contentId: 1, outcome: 'published' },
            {
              contentId: 3,
              outcome: 'failed',
              message: 'O conteúdo 3 não pode ser aprovado em lote: tem 1 pendência(s)',
            },
          ],
        }),
      ),
    );

    const dialog = await openSummary(user);
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Aprovar e publicar' }));

    const result = await screen.findByRole('dialog', { name: 'Resultado do lote' });
    expect(action).toHaveBeenCalledWith('exemplo-a', [
      { contentId: 1, version: 2 },
      { contentId: 3, version: 5 },
    ]);
    expect(within(result).getByRole('region', { name: 'Foram ao ar (1)' }).textContent).toContain(
      'Limpo A',
    );
    expect(within(result).getByRole('region', { name: 'Falharam (1)' }).textContent).toContain(
      'Limpo B: O conteúdo 3 não pode ser aprovado em lote: tem 1 pendência(s)',
    );
    expect(within(result).queryByRole('region', { name: /Agendados/ })).toBeNull();
    // A seleção zera depois do envio.
    await user.click(within(result).getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Aprovar e publicar selecionados' })).toBeNull();
  });

  it('o agendado mostra a data e a hora de São Paulo e o aviso do transbordo', async () => {
    const user = userEvent.setup();
    renderBatch();

    const dialog = await openSummary(user);
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Aprovar e publicar' }));

    const result = await screen.findByRole('dialog', { name: 'Resultado do lote' });
    const scheduled = within(result).getByRole('region', { name: 'Agendados (1)' });
    expect(scheduled.textContent).toContain('Limpo B: agendado para 13/11/2026, 10:00 BRT.');
    expect(scheduled.textContent).toContain(overflow);
  });

  it('a recusa do lote inteiro fica no resumo, com o motivo', async () => {
    const user = userEvent.setup();
    renderBatch(
      vi.fn<ApproveBatch>(() =>
        Promise.resolve({ ok: false, message: 'Sem permissão para content.publish' }),
      ),
    );

    const dialog = await openSummary(user);
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Aprovar e publicar' }));

    await waitFor(() =>
      expect(within(dialog).getByRole('alert').textContent).toBe(
        'Sem permissão para content.publish',
      ),
    );
    expect(screen.getByRole('dialog', { name: 'Aprovar e publicar 2 conteúdos?' })).toBeTruthy();
  });

  it('Cancelar não envia e a seleção fica', async () => {
    const user = userEvent.setup();
    const action = renderBatch();

    const dialog = await openSummary(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText('2 conteúdos selecionados')).toBeTruthy();
  });
});
