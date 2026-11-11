// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { audienceChartData } from './AudienceChart.tsx';
import AudienceMetrics from './AudienceMetrics.tsx';
import { AudienceTable } from './AudienceTable.tsx';
import { formatAudienceDay, formatAudienceShortDay, formatCount } from './format.ts';

// Cartões e tabela da audiência (#548): números em pt-BR, dia de São Paulo sem andar de fuso
// e a tabela do dia mais recente para o mais antigo.

vi.mock('next/navigation', () => ({
  usePathname: () => '/sites/exemplo-a/audiencia',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => undefined }),
}));

afterEach(cleanup);

describe('format', () => {
  it('números com separador de milhar e dia como no calendário', () => {
    expect(formatCount(1_234_567)).toBe('1.234.567');
    expect(formatAudienceDay('2026-11-04')).toBe('qua., 04/11/2026');
    // O primeiro dia do mês não volta para o último do anterior (UTC−3).
    expect(formatAudienceDay('2026-11-01')).toBe('dom., 01/11/2026');
    expect(formatAudienceShortDay('2026-11-01')).toBe('01/11');
  });
});

describe('audienceChartData', () => {
  it('dias em ordem cronológica, uma série por métrica e o nome com o período', () => {
    const data = audienceChartData(
      [
        { day: '2026-11-04', views: 12_345, sessions: 3_210 },
        { day: '2026-11-01', views: 15, sessions: 9 },
        { day: '2026-11-03', views: 980, sessions: 400 },
      ],
      30,
    );
    expect(data.categories).toEqual(['2026-11-01', '2026-11-03', '2026-11-04']);
    expect(data.series).toEqual([
      { name: 'Visualizações', data: [15, 980, 12_345] },
      { name: 'Sessões', data: [9, 400, 3_210] },
    ]);
    expect(data.label).toBe(
      'Visualizações e sessões por dia nos últimos 30 dias, de dom., 01/11/2026 a qua., 04/11/2026. Os valores estão na tabela abaixo.',
    );
  });
});

describe('AudienceMetrics', () => {
  it('total de visualizações e de sessões do período', () => {
    render(<AudienceMetrics totals={{ views: 15_340, sessions: 3_619 }} selectedPeriod={30} />);
    expect(screen.getByText('15.340')).toBeTruthy();
    expect(screen.getByText('3.619')).toBeTruthy();
    expect(screen.getByText('Últimos 30 dias')).toBeTruthy();
    expect(screen.getByText('Últimos 30 dias, soma dos dias')).toBeTruthy();
  });
});

describe('AudienceTable', () => {
  it('uma linha por dia, a mais recente primeiro', () => {
    render(
      <AudienceTable
        rows={[
          { day: '2026-11-01', views: 15, sessions: 9 },
          { day: '2026-11-04', views: 12_345, sessions: 3_210 },
        ]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Audiência por dia' });
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    expect(rows).toEqual([
      ['qua., 04/11/2026', '12.345', '3.210'],
      ['dom., 01/11/2026', '15', '9'],
    ]);
  });
});
