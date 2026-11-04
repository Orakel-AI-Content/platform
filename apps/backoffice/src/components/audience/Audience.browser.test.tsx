import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { EmptyState } from '@/components/shared/EmptyState';
import type { AudienceDay, AudiencePeriod } from '@/domain/audience/read.ts';

import {
  audit,
  COLOR_SCHEMES,
  setReducedMotion,
  setTheme,
  tabTo,
} from '../../../test/browser/a11y.ts';
import { pageOverflow, tableOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';
import AudienceHeader from './AudienceHeader.tsx';
import AudienceMetrics from './AudienceMetrics.tsx';
import { AudienceTable } from './AudienceTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Audiência do site em Chromium (#548): o período trocado só pelo teclado vai para a URL, a
// tela a 1280 px sem rolagem horizontal e o axe nos dois temas, com dados e vazia.

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
          <AdaptiveCard>
            <AudienceTable rows={days} />
          </AdaptiveCard>
        </>
      )}
    </section>
  );
}

const period = () => page.getByRole('combobox', { name: 'Período:' });
const table = () => page.getByRole('table', { name: 'Audiência por dia' });

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

  it('a 1280 px, cartões e tabela sem rolagem horizontal', async () => {
    await renderInFrame(<Audience />, { roles: ['revisor'] });
    await expect.element(table().getByRole('cell', { name: '12.345' })).toBeVisible();
    await expect.element(page.getByText('13.340', { exact: true })).toBeVisible();

    expect(pageOverflow()).toBe(0);
    expect(tableOverflow(table())).toBe(0);
  });

  it.each(COLOR_SCHEMES)('com dados, sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Audience />, { roles: ['revisor'] });
    await expect.element(table()).toBeVisible();
    expect(await audit()).toEqual([]);
  });

  it.each(COLOR_SCHEMES)('vazia, sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Audience days={[]} />, { roles: ['revisor'] });
    await expect
      .element(page.getByText('Nenhuma visualização consolidada nos últimos 7 dias.'))
      .toBeVisible();
    expect(await audit()).toEqual([]);
  });
});
