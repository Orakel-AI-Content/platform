import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import type { ContentData } from '@/db/schema/index.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { pageOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';
import { ContentVersionView, type VersionReferences } from './ContentVersionView.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Uma versão em cartões em Chromium (#460; antes no E2E, `contents.spec.ts`, #372): a 375 px, na
// moldura do admin e na largura dos formulários (a da página da versão), a URL canônica de 120
// caracteres sem espaço quebra dentro do cartão "Dados" e a página não rola na horizontal; o axe
// roda nos dois temas. Com a capa e a imagem do bloco em miniatura e os nomes (#593), também sem
// rolar.

const CANONICAL = `https://exemplo-a.example.com/${'guiacompleto'.repeat(10)}`.slice(0, 120);

const DATA: ContentData = {
  kind: 'article',
  slug: 'versao-em-cartoes',
  title: 'Versão em cartões',
  authorIds: [1],
  taxonomyIds: [],
  publishedAt: '2026-10-01T12:00:00Z',
  seo: { title: 'Versão em cartões', description: 'Uma versão para ler.', canonical: CANONICAL },
  coverMediaId: 3,
  blocks: [
    { n: 1, type: 'toc', title: 'Neste guia' },
    { n: 2, type: 'image', mediaId: 9, alt: 'Canteiro de alface em vasos na varanda' },
  ],
};

/** Imagem local (sem rede) nas dimensões da mídia: a miniatura tem de caber no cartão mesmo larga. */
const pixel = (width: number, height: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#6b8e23"/></svg>`,
  )}`;

const REFERENCES: VersionReferences = {
  authors: new Map([[1, 'Ana Souza']]),
  taxonomies: new Map(),
  media: new Map([
    [3, { id: 3, width: 3200, height: 1800, sources: [], src: pixel(3200, 1800) }],
    [9, { id: 9, width: 1600, height: 1200, sources: [], src: pixel(1600, 1200) }],
  ]),
};

function Version() {
  return (
    <article aria-label="Versão 1" className="form-width space-y-4">
      <ContentVersionView data={DATA} timeZone="America/Sao_Paulo" references={REFERENCES} />
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

  it('a 375 px, a capa e a imagem do bloco ficam em miniatura dentro do cartão, sem rolar', async () => {
    await page.viewport(375, 800);
    const screen = await renderInFrame(<Version />);
    expect(screen.getByText('Ana Souza', { exact: true }).element()).toBeTruthy();

    for (const caption of ['Mídia 3 · 3200×1800', 'Mídia 9 · 1600×1200']) {
      const field = screen.getByText(caption, { exact: true }).element().closest('dd')!;
      const image = field.querySelector('img')!;
      const card = field.closest('.card')!.getBoundingClientRect();
      const box = image.getBoundingClientRect();
      expect(image.getAttribute('alt')).toBe('');
      expect(box.width).toBeLessThanOrEqual(96);
      expect(box.right).toBeLessThanOrEqual(card.right + 1);
    }
    expect(screen.getByText('Canteiro de alface em vasos na varanda').element()).toBeTruthy();
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
