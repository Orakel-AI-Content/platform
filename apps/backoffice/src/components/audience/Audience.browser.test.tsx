import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { EmptyState } from '@/components/shared/EmptyState';
import type { AudienceDay, AudiencePeriod } from '@/domain/audience/read.ts';

import { setReducedMotion, tabTo } from '../../../test/browser/a11y.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';
import AudienceChart from './AudienceChart.tsx';
import AudienceHeader from './AudienceHeader.tsx';
import AudienceMetrics from './AudienceMetrics.tsx';
import { AudienceTable } from './AudienceTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Audiência do site em Chromium (#548): o período trocado só pelo teclado vai para a URL. O gráfico
// por dia (#599): nome com o período, legenda em texto, valor do dia no foco e no hover, e
// nenhum gráfico sem dados.

const PATH = '/sites/exemplo-a/audiencia';

const DAYS: AudienceDay[] = [
  { day: '2026-11-04', views: 12_345, sessions: 3_210 },
  { day: '2026-11-03', views: 980, sessions: 400 },
  { day: '2026-11-01', views: 15, sessions: 9 },
];

/** O mesmo arranjo de `sites/[site]/audiencia/page.tsx`. */
function Audience({ period = 7, days = DAYS }: { period?: AudiencePeriod; days?: AudienceDay[] }) {
  const totals = days.reduce(
    (sum, row) => ({ views: sum.views + row.views, sessions: sum.sessions + row.sessions }),
    { views: 0, sessions: 0 },
  );
  return (
    <section aria-labelledby="audience-title" className="list-width space-y-4">
      <AudienceHeader titleId="audience-title" selectedPeriod={period} />
      {days.length === 0 ? (
        <EmptyState>Nenhuma visualização consolidada nos últimos {period} dias.</EmptyState>
      ) : (
        <>
          <AudienceMetrics totals={totals} selectedPeriod={period} />
          <AudienceChart days={days} selectedPeriod={period} />
          <AdaptiveCard>
            <AudienceTable rows={days} />
          </AdaptiveCard>
        </>
      )}
    </section>
  );
}

const period = () => page.getByRole('combobox', { name: 'Período:' });
const chart = () => page.getByRole('application', { name: /^Visualizações e sessões por dia/ });
const tooltip = () => document.querySelector<HTMLElement>('.apexcharts-tooltip.apexcharts-active');

beforeEach(() => {
  navigation.set(PATH);
});

afterEach(() => {
  navigation.set('/');
});

describe('audiência no navegador', () => {
  it('o período se troca só pelo teclado e vai para a URL; 7 dias sai da URL', async () => {
    navigation.set(`${PATH}?pagina=2`);
    await renderInFrame(<Audience />, { roles: ['revisor'] });

    await tabTo(period().element());
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(period()).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');
    // Trocar o período volta a tabela à primeira página.
    expect(navigation.get()).toBe(`${PATH}?periodo=30`);
    await expect.element(period()).toHaveFocus();
  });

  it('com 30 dias, escolher 7 tira o parâmetro', async () => {
    navigation.set(`${PATH}?periodo=30`);
    await renderInFrame(<Audience period={30} />, { roles: ['revisor'] });

    (period().element() as HTMLElement).focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard('{Enter}');
    expect(navigation.get()).toBe(PATH);
  });

  it('o gráfico tem nome com o período, legenda em texto e as séries em ordem cronológica', async () => {
    // Sem animação de entrada: ela desenha a linha sólida com `stroke-dasharray`.
    await setReducedMotion('reduce');
    await renderInFrame(<Audience />, { roles: ['revisor'] });
    await expect
      .element(chart())
      .toHaveAccessibleName(
        'Visualizações e sessões por dia nos últimos 7 dias, de dom., 01/11/2026 a qua., 04/11/2026. Os valores estão na tabela abaixo.',
      );
    const legend = page.getByRole('list', { name: 'Legenda' });
    await expect.element(legend.getByText('Visualizações', { exact: true })).toBeVisible();
    await expect.element(legend.getByText('Sessões', { exact: true })).toBeVisible();
    // Traço diferente por série: a de sessões é tracejada, a de visualizações não.
    const dashes = () =>
      [...document.querySelectorAll('.apexcharts-series path.apexcharts-line')].map((path) =>
        path.getAttribute('stroke-dasharray'),
      );
    await expect.poll(dashes).toEqual(['0', '6']);
  });

  it('o foco pelo teclado mostra o valor do dia e as setas andam pelos dias', async () => {
    await setReducedMotion('reduce');
    await renderInFrame(<Audience />, { roles: ['revisor'] });
    await tabTo(chart().element());
    await expect.poll(() => tooltip()?.textContent ?? '').toContain('dom., 01/11/2026');
    expect(tooltip()?.textContent).toContain('15');
    await userEvent.keyboard('{End}');
    await expect.poll(() => tooltip()?.textContent ?? '').toContain('12.345');
    expect(tooltip()?.textContent).toContain('qua., 04/11/2026');
  });

  it('o hover mostra o valor do dia', async () => {
    await setReducedMotion('reduce');
    await renderInFrame(<Audience />, { roles: ['revisor'] });
    await expect.element(chart()).toBeVisible();
    const grid = document.querySelector('.apexcharts-grid')!.getBoundingClientRect();
    await userEvent.hover(chart(), {
      position: {
        x: grid.right - 5 - chart().element().getBoundingClientRect().left,
        y: grid.height / 2,
      },
    });
    await expect.poll(() => tooltip()?.textContent ?? '').toContain('12.345');
  });

  it('sem dados, nenhum gráfico', async () => {
    await renderInFrame(<Audience days={[]} />, { roles: ['revisor'] });
    await expect
      .element(page.getByText('Nenhuma visualização consolidada nos últimos 7 dias.'))
      .toBeVisible();
    expect(document.querySelector('.apexcharts-canvas')).toBeNull();
    expect(
      page.getByRole('heading', { name: 'Visualizações e sessões por dia' }).query(),
    ).toBeNull();
  });
});
