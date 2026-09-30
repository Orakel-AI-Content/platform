// WCAG 2.2 AA (P14) nas páginas dos sites de exemplo, em 375 e 1280 px. Violação quebra o CI.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { SERVERS } from '../playwright.config.ts';

const PAGES = {
  'exemplo-a': [
    '/',
    '/guia-completo/',
    '/quem-somos/',
    '/categoria/guias/',
    '/tag/iniciantes/',
    '/autor/ana-souza/',
    '/sobre/',
    '/busca/',
    '/nao-existe/',
  ],
  'exemplo-b': [
    '/',
    '/arroz-de-forno/',
    '/categoria/receitas/',
    '/autor/carla-dias/',
    '/privacidade/',
    '/busca/',
    '/nao-existe/',
  ],
} as const;

const WIDTHS = [375, 1280];

for (const [site, paths] of Object.entries(PAGES) as [keyof typeof PAGES, readonly string[]][]) {
  for (const width of WIDTHS) {
    for (const path of paths) {
      test(`${site} ${path} @${width}px sem violações de acessibilidade`, async ({ page }) => {
        // Sem rede externa: mídia de exemplo e pageviews não existem nos testes.
        await page.route(/media\.|\/_e\//, (route) => route.abort());
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${SERVERS[site]}${path}`);
        await expect(page.locator('html')).toHaveAttribute('data-page-type', /.+/);
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual(
          [],
        );
      });
    }
  }
}
