// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReviewOpinionSummary } from '@/domain/reviews/opinions.ts';

import { formatCost, formatRunDuration, formatTokens } from './GenerationRunsTable.tsx';
import { ReviewOpinionsTable } from './ReviewOpinionsTable.tsx';

// Pareceres da revisão na tela de Geração (#796): a ordem do domínio, cada um com conteúdo
// (link para a revisão), versão, estado, provedor e modelo, tokens, custo e duração; o que
// falta aparece como "—", e o parecer copiado não repete o custo da versão de origem.

vi.mock('next/navigation', () => ({
  usePathname: () => '/sites/exemplo-a/geracao',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

afterEach(cleanup);

const DONE: ReviewOpinionSummary = {
  contentId: 42,
  contentTitle: 'Guia do café coado',
  version: 3,
  status: 'ok',
  copiedFromVersion: null,
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  inputTokens: 12345,
  outputTokens: 678,
  costUsd: 0.00035,
  durationMs: 12_300,
  requestedAt: new Date('2026-11-02T12:00Z'),
};

const PENDING: ReviewOpinionSummary = {
  contentId: 7,
  contentTitle: 'Chá verde',
  version: 1,
  status: 'pendente',
  copiedFromVersion: null,
  provider: null,
  model: null,
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
  durationMs: null,
  requestedAt: new Date('2026-11-03T12:00Z'),
};

const COPIED: ReviewOpinionSummary = {
  ...DONE,
  version: 4,
  copiedFromVersion: 3,
  requestedAt: new Date('2026-11-04T12:00Z'),
};

function renderTable(rows: ReviewOpinionSummary[]) {
  render(<ReviewOpinionsTable siteId="exemplo-a" rows={rows} />);
}

const rowOfVersion = (version: number) =>
  screen.getByText(`v${version}`).closest('tr') as HTMLElement;

describe('lista dos pareceres', () => {
  it('na ordem do domínio, com o conteúdo e a versão', () => {
    renderTable([PENDING, DONE]);
    const cells = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .slice(0, 2)
          .map((cell) => cell.textContent),
      );
    expect(cells).toEqual([
      ['Chá verde', 'v1'],
      ['Guia do café coado', 'v3'],
    ]);
  });

  it('o concluído mostra tudo com a formatação da geração e o link para a revisão', () => {
    renderTable([DONE]);
    const row = within(rowOfVersion(3));
    for (const text of [
      'Concluído',
      'anthropic',
      'claude-sonnet-5-5',
      formatTokens(12345),
      formatTokens(678),
      formatCost(0.00035),
      formatRunDuration(12_300),
    ]) {
      expect(row.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(row.getByRole('link', { name: 'Guia do café coado' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/revisao/42',
    );
  });

  it('o pendente mostra "—" no modelo, nos tokens, no custo e na duração', () => {
    renderTable([PENDING]);
    const row = within(rowOfVersion(1));
    expect(row.getByText('Pendente')).toBeTruthy();
    expect(row.getAllByText('—')).toHaveLength(4);
    expect(row.getByRole('link', { name: 'Chá verde' })).toBeTruthy();
  });

  it('sem preço, o custo aparece como "—" e o resto continua', () => {
    renderTable([{ ...DONE, costUsd: null }]);
    const row = within(rowOfVersion(3));
    expect(row.getAllByText('—')).toHaveLength(1);
    expect(row.getByText(formatRunDuration(12_300))).toBeTruthy();
  });

  it('o copiado aparece marcado e sem tokens, custo nem duração', () => {
    renderTable([COPIED]);
    const row = within(rowOfVersion(4));
    expect(row.getByText('Copiado da v3')).toBeTruthy();
    expect(row.getByText('claude-sonnet-5-5')).toBeTruthy();
    expect(row.getAllByText('—')).toHaveLength(3);
    expect(row.queryByText(formatCost(0.00035))).toBeNull();
  });

  it('sem pareceres, o estado vazio', () => {
    renderTable([]);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/Nenhum parecer ainda/)).toBeTruthy();
  });
});
