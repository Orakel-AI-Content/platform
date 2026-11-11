import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import type { ContentStatusCounts } from '@/domain/content/contents.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { pageOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';
import { SiteContentMetrics } from './SiteContentMetrics.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Cartões de conteúdo da Visão geral em Chromium (#596): na moldura do admin, sem rolagem
// horizontal a 1280 e a 390 px e sem violação do axe (WCAG 2.2 AA) nos dois temas.

const COUNTS: ContentStatusCounts = {
  rascunho: 12,
  em_revisao: 3,
  aprovado: 1,
  agendado: 2,
  publicado: 1_250,
  despublicado: 4,
  substituido: 7,
};

function Overview({ canWrite = true }: { canWrite?: boolean }) {
  return (
    <section aria-labelledby="site-title" className="list-width space-y-4">
      <h1 id="site-title">Exemplo A — Guias</h1>
      <SiteContentMetrics
        siteId="exemplo-a"
        counts={COUNTS}
        publishedToday={2}
        dailyLimit={10}
        canWrite={canWrite}
      />
    </section>
  );
}

beforeEach(() => {
  navigation.set('/sites/exemplo-a');
});

afterEach(async () => {
  navigation.set('/');
  await page.viewport(1280, 720);
});

describe('SiteContentMetrics no navegador', () => {
  it.each([
    [1280, 720],
    [390, 844],
  ])('a %i px, os seis cartões e os atalhos sem rolagem horizontal', async (width, height) => {
    await page.viewport(width, height);
    await renderInFrame(<Overview />);
    await expect.element(page.getByText('1.250', { exact: true })).toBeVisible();
    await expect.element(page.getByRole('link', { name: 'Criar conteúdo' })).toBeVisible();
    expect(pageOverflow()).toBe(0);
  });

  it.each(COLOR_SCHEMES)('sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Overview />);
    await expect.element(page.getByText('Publicações hoje')).toBeVisible();
    expect(await audit()).toEqual([]);
  });
});
