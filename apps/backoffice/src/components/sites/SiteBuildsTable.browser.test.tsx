import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import Card from '@/components/ui/Card';
import type { SiteInstance } from '@/domain/sites/sites.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { pageOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';
import { SiteBuildsTable } from './SiteBuildsTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Aba "Builds" da página do site em Chromium (#595): os cinco últimos builds na `Table` do
// Ecme, num cartão da moldura do admin, sem rolagem horizontal da página (a tabela rola dentro
// do próprio contêiner) e sem violação do axe (WCAG 2.2 AA) nos dois temas.

const statuses = ['failed', 'ok', 'ok', 'failed', 'ok'] as const;

const BUILDS: SiteInstance['recentBuilds'] = statuses.map((status, index) => ({
  id: 5 - index,
  status,
  release: '1.4.0',
  versionId: status === 'ok' ? `20261020T1${index}0000Z-0123abcd` : null,
  finishedAt: new Date(Date.UTC(2026, 9, 20, 13 - index)),
}));

function Builds() {
  return (
    <section className="list-width space-y-4">
      <Card>
        <SiteBuildsTable builds={BUILDS} timeZone="America/Sao_Paulo" />
      </Card>
    </section>
  );
}

beforeEach(() => {
  navigation.set('/sites/exemplo-a');
});

afterEach(() => {
  navigation.set('/');
});

describe('SiteBuildsTable no navegador', () => {
  it.each([1280, 375])('sem rolagem horizontal da página a %i px', async (width) => {
    await page.viewport(width, 900);
    await renderInFrame(<Builds />);
    await expect.element(page.getByRole('table', { name: 'Últimos builds' })).toBeVisible();
    expect(pageOverflow()).toBe(0);
  });

  it.each(COLOR_SCHEMES)('sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Builds />);
    await expect.element(page.getByRole('table', { name: 'Últimos builds' })).toBeVisible();
    expect(await audit()).toEqual([]);
  });
});
