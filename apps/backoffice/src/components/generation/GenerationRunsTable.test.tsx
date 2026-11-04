// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GenerationRunSummary } from '@/domain/generation/runs.ts';

import {
  formatCost,
  formatRunDuration,
  formatTokens,
  GenerationRunsTable,
} from './GenerationRunsTable.tsx';

// Execuções da geração: a ordem do domínio, cada uma com status, provedor, modelo, tokens,
// custo, duração e o link para o conteúdo quando `ok`; o que falta aparece como "—".

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

function renderTable(rows = ROWS) {
  render(<GenerationRunsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />);
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
    expect(row.getByText(/US\$\s0,00035/)).toBeTruthy();
    expect(row.getByRole('link', { name: 'Conteúdo 42 (abrir)' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/conteudos/42',
    );
  });

  it('pendente e custo nulo aparecem como "—", sem link', () => {
    renderTable();
    const pending = within(rowOf('Café coado'));
    expect(pending.getAllByText('—')).toHaveLength(7);
    expect(pending.queryByRole('link')).toBeNull();
    const unpriced = within(rowOf('Pão de fermentação'));
    expect(unpriced.getAllByText('—')).toHaveLength(2);
    expect(unpriced.getByText('850 ms')).toBeTruthy();
  });

  it('sem execuções, o estado vazio', () => {
    renderTable([]);
    expect(screen.getByText(/Nenhuma execução ainda/)).toBeTruthy();
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

  it('custo em dólares com até 6 casas; duração em ms ou s', () => {
    expect(formatCost(1.5)).toMatch(/US\$\s1,50/);
    expect(formatRunDuration(999)).toBe('999 ms');
    expect(formatRunDuration(1000)).toBe('1 s');
  });
});
