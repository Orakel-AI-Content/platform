import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import type { SiteInstance, SiteSummary } from '@/domain/sites/sites.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { pageOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';
import { SiteSummaryCard } from './SiteSummaryCard.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Resumo do site em Chromium (#516): o estado da instância (domínio como link, versão no ar com
// os arquivos e as mudanças pendentes por origem) e os estados vazios, na moldura do admin, sem rolagem
// horizontal e sem violação do axe (WCAG 2.2 AA) nos dois temas. Os últimos builds ficam na aba
// "Builds" (`SiteBuildsTable.browser.test.tsx`, #595).

const SITE: SiteSummary = {
  id: 'exemplo-a',
  name: 'Exemplo A — Guias',
  domain: 'exemplo-a.example.com',
  lifecycle: 'publicado',
  state: 'ativo',
  pausedReason: null,
  pausedCulprit: null,
  activeVersionId: 'v-0123456789abcdef',
  release: '1.4.0',
  indexavel: true,
  pendingChanges: 4,
  lastBuild: {
    status: 'failed',
    versionId: null,
    finishedAt: new Date('2026-10-20T13:00:00.000Z'),
  },
  buildWindowSeconds: null,
  effectiveBuildWindowSeconds: 900,
  dailyPublishLimit: null,
  effectiveDailyPublishLimit: 10,
  publishedToday: 2,
  timeZone: 'America/Sao_Paulo',
};

const statuses = ['failed', 'ok', 'ok', 'failed', 'ok'] as const;

const INSTANCE: SiteInstance = {
  recentBuilds: statuses.map((status, index) => ({
    id: 5 - index,
    status,
    release: '1.4.0',
    versionId: status === 'ok' ? `v-0123456789abcde${index}` : null,
    finishedAt: new Date(Date.UTC(2026, 9, 20, 13 - index)),
  })),
  activeFiles: 412,
  pendingByOrigin: [
    { origin: 'content', count: 2 },
    { origin: 'redirect', count: 1 },
    { origin: 'config', count: 1 },
  ],
};

const EMPTY: SiteInstance = { recentBuilds: [], activeFiles: null, pendingByOrigin: [] };

const SCENARIOS = [
  ['com builds e pendências', { ...SITE }, INSTANCE],
  [
    'vazio',
    { ...SITE, domain: '', activeVersionId: null, pendingChanges: 0, lastBuild: null },
    EMPTY,
  ],
] as const;

beforeEach(() => {
  navigation.set(`/sites/${SITE.id}`);
});

afterEach(() => {
  navigation.set('/');
});

describe.each(SCENARIOS)('SiteSummaryCard no navegador (%s)', (_, site, instance) => {
  it.each([1280, 375])('sem rolagem horizontal a %i px', async (width) => {
    await page.viewport(width, 900);
    await renderInFrame(
      <section className="list-width space-y-4">
        <SiteSummaryCard site={site} instance={instance} g1Registered />
      </section>,
    );
    await expect.element(page.getByText('Versão no ar')).toBeVisible();
    expect(pageOverflow()).toBe(0);
  });

  it.each(COLOR_SCHEMES)('sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(
      <section className="list-width space-y-4">
        <SiteSummaryCard site={site} instance={instance} g1Registered />
      </section>,
    );
    await expect.element(page.getByText('Versão no ar')).toBeVisible();
    expect(await audit()).toEqual([]);
  });
});
