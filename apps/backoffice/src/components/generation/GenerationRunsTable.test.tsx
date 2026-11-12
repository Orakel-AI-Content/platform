// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GenerationRunSummary } from '@/domain/generation/runs.ts';

import {
  formatCost,
  formatRunDuration,
  formatTokens,
  GenerationRunsTable,
  type GenerationRunsStatus,
} from './GenerationRunsTable.tsx';

// Execuções da geração: a ordem do domínio, cada uma com status, provedor, modelo, tokens,
// custo, duração e o link para a revisão do conteúdo quando `ok`; o que falta aparece como "—".
// Com execução pendente, relê a lista pela Server Action até ela terminar (#779).

vi.mock('next/navigation', () => ({
  usePathname: () => '/sites/exemplo-a/geracao',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

afterEach(cleanup);

const base = {
  provider: null,
  model: null,
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
  durationMs: null,
  contentId: null,
} as const;

const ROWS: GenerationRunSummary[] = [
  {
    ...base,
    id: 3,
    createdAt: new Date('2026-11-03T12:00Z'),
    topic: 'Café coado',
    status: 'pendente',
  },
  {
    id: 2,
    createdAt: new Date('2026-11-02T12:00Z'),
    topic: 'Chá verde',
    status: 'ok',
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    inputTokens: 12345,
    outputTokens: 678,
    costUsd: 0.00035,
    durationMs: 12_300,
    contentId: 42,
  },
  {
    ...base,
    id: 1,
    createdAt: new Date('2026-11-01T12:00Z'),
    topic: 'Pão de fermentação',
    status: 'falha',
    provider: 'openai',
    model: 'gpt-x',
    inputTokens: 10,
    outputTokens: 5,
    durationMs: 850,
  },
];

function renderTable(rows = ROWS, hasContext = true) {
  render(
    <GenerationRunsTable
      siteId="exemplo-a"
      timeZone="America/Sao_Paulo"
      rows={rows}
      hasContext={hasContext}
    />,
  );
}

const rowOf = (topic: string) => screen.getAllByText(topic)[0]!.closest('tr') as HTMLElement;

describe('lista das execuções', () => {
  it('na ordem do domínio, a mais recente primeiro', () => {
    renderTable();
    const topics = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[1]?.textContent);
    expect(topics).toEqual(['Café coado', 'Chá verde', 'Pão de fermentação']);
  });

  it('a concluída mostra tudo e o link para o conteúdo', () => {
    renderTable();
    const row = within(rowOf('Chá verde'));
    for (const text of ['Concluída', 'anthropic', 'claude-sonnet-5-5', '12.345', '678', '12,3 s']) {
      expect(row.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(row.getByText('0,00035')).toBeTruthy();
    expect(row.getByRole('link', { name: 'Conteúdo #42 (abrir)' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/revisao/42',
    );
  });

  it('pendente e custo nulo aparecem como "—", sem link', () => {
    renderTable();
    const pending = within(rowOf('Café coado'));
    expect(pending.getAllByText('—')).toHaveLength(5);
    expect(pending.queryByRole('link')).toBeNull();
    const unpriced = within(rowOf('Pão de fermentação'));
    expect(unpriced.getAllByText('—')).toHaveLength(2);
    expect(unpriced.getByText('850 ms')).toBeTruthy();
  });

  it('sem execuções, o estado vazio manda gerar o primeiro artigo', () => {
    renderTable([]);
    expect(screen.getByText('Nenhuma execução ainda: gere o primeiro artigo.')).toBeTruthy();
  });

  it('sem execuções nem contexto editorial, o estado vazio não manda gerar', () => {
    renderTable([], false);
    expect(screen.getByText(/Nenhuma execução ainda/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('gere o primeiro artigo');
    expect(document.body.textContent).toContain('contexto editorial');
  });
});

describe('lista ao vivo', () => {
  const POLL_MS = 100;
  const status = vi.fn<GenerationRunsStatus>();
  const [pending, done, failed] = ROWS as [
    GenerationRunSummary,
    GenerationRunSummary,
    GenerationRunSummary,
  ];
  const tick = () => act(() => vi.advanceTimersByTimeAsync(POLL_MS));

  function renderLive(rows: GenerationRunSummary[]) {
    return render(
      <GenerationRunsTable
        siteId="exemplo-a"
        timeZone="America/Sao_Paulo"
        rows={rows}
        hasContext
        status={status}
        pollMs={POLL_MS}
      />,
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    status.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('com execução pendente, consulta e mostra "Concluída" quando ela termina, com o link', async () => {
    status
      .mockResolvedValueOnce([pending, done])
      .mockResolvedValueOnce([{ ...done, id: 3, topic: 'Café coado', contentId: 43 }, done]);
    renderLive([pending, done]);

    expect(within(rowOf('Café coado')).getByText('Pendente')).toBeTruthy();
    await tick();
    expect(status).toHaveBeenCalledTimes(1);
    expect(within(rowOf('Café coado')).getByText('Pendente')).toBeTruthy();
    await tick();
    const row = within(rowOf('Café coado'));
    expect(row.getByText('Concluída')).toBeTruthy();
    expect(row.getByRole('link', { name: 'Conteúdo #43 (abrir)' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/revisao/43',
    );
  });

  it('mostra "Falhou" quando a execução pendente falha', async () => {
    status.mockResolvedValue([{ ...failed, id: 3, topic: 'Café coado' }]);
    renderLive([pending]);

    await tick();
    expect(within(rowOf('Café coado')).getByText('Falhou')).toBeTruthy();
  });

  it('sem execução pendente, não consulta', async () => {
    renderLive([done, failed]);

    expect(vi.getTimerCount()).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 10));
    expect(status).not.toHaveBeenCalled();
  });

  it('quando nenhuma execução fica pendente, as consultas param', async () => {
    status.mockResolvedValue([{ ...done, id: 3, topic: 'Café coado' }]);
    renderLive([pending]);

    await tick();
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 10));
    expect(status).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uma leitura recusada mantém a lista e tenta de novo', async () => {
    status
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([{ ...done, id: 3, topic: 'Café coado' }]);
    renderLive([pending]);

    await tick();
    expect(within(rowOf('Café coado')).getByText('Pendente')).toBeTruthy();
    await tick();
    expect(within(rowOf('Café coado')).getByText('Concluída')).toBeTruthy();
  });

  it('a lista nova da página substitui a do polling e liga as consultas', async () => {
    const view = renderLive([done]);
    expect(vi.getTimerCount()).toBe(0);

    status.mockResolvedValue([{ ...done, id: 3, topic: 'Café coado' }, done]);
    view.rerender(
      <GenerationRunsTable
        siteId="exemplo-a"
        timeZone="America/Sao_Paulo"
        rows={[pending, done]}
        hasContext
        status={status}
        pollMs={POLL_MS}
      />,
    );
    expect(within(rowOf('Café coado')).getByText('Pendente')).toBeTruthy();
    await tick();
    expect(within(rowOf('Café coado')).getByText('Concluída')).toBeTruthy();
  });
});

describe('formatação', () => {
  it('nulos viram "—"', () => {
    expect([formatTokens(null), formatCost(null), formatRunDuration(null)]).toEqual([
      '—',
      '—',
      '—',
    ]);
  });

  it('custo com até 6 casas; duração em ms ou s', () => {
    expect(formatCost(1.5)).toBe('1,50');
    expect(formatRunDuration(999)).toBe('999 ms');
    expect(formatRunDuration(1000)).toBe('1 s');
  });
});
