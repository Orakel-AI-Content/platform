import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import type { ContentData } from '@/db/schema/index.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { pageOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';
import { ContentVersionView } from './ContentVersionView.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Uma versão em cartões em Chromium (#460; antes no E2E, `contents.spec.ts`, #372): a 375 px, na
// moldura do admin e na largura dos formulários (a da página da versão), a URL canônica de 120
// caracteres sem espaço quebra dentro do cartão "Dados" e a página não rola na horizontal; o axe
// roda nos dois temas.

const CANONICAL = `https://exemplo-a.example.com/${'guiacompleto'.repeat(10)}`.slice(0, 120);

const DATA: ContentData = {
  kind: 'article',
  slug: 'versao-em-cartoes',
  title: 'Versão em cartões',
  authorIds: [1],
  taxonomyIds: [],
  publishedAt: '2026-10-01T12:00:00Z',
  seo: { title: 'Versão em cartões', description: 'Uma versão para ler.', canonical: CANONICAL },
  blocks: [{ n: 1, type: 'toc', title: 'Neste guia' }],
};

function Version() {
  return (
    <article aria-label="Versão 1" className="form-width space-y-4">
      <ContentVersionView data={DATA} timeZone="America/Sao_Paulo" />
    </article>
  );
}

beforeEach(() => {
  navigation.set('/sites/exemplo-a/conteudos/42/versoes/1');
});

afterEach(() => {
  navigation.set('/');
});

describe('ContentVersionView no navegador', () => {
  it('a 375 px, o canônico longo quebra dentro do cartão, sem rolar a página', async () => {
    await page.viewport(375, 800);
    const screen = await renderInFrame(<Version />);
    const value = screen.getByText(CANONICAL, { exact: true }).element();
    const card = value.closest('.card')!;
    expect(card.querySelector('h2')?.textContent).toBe('Dados');

    const valueBox = value.getBoundingClientRect();
    expect(valueBox.right).toBeLessThanOrEqual(card.getBoundingClientRect().right + 1);
    expect(valueBox.height).toBeGreaterThan(
      Number.parseFloat(getComputedStyle(value).lineHeight) * 1.5,
    );
    expect(pageOverflow()).toBe(0);
  });

  it.each(COLOR_SCHEMES)('a 375 px, sem violação do axe (%s)', async (scheme) => {
    await page.viewport(375, 800);
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Version />);
    expect(await audit()).toEqual([]);
  });
});
