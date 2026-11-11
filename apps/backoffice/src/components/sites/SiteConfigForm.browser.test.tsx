import { RESOURCES, type SiteConfig } from '@orakel/content-model/v1';
import { THEME_SUMMARIES } from '@orakel/tokens';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import { HEADER_HEIGHT } from '@/components/template/constants';

import { audit, COLOR_SCHEMES, setTheme } from '../../../test/browser/a11y.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';
import { editValues } from './siteConfigFormValues.ts';
import { SiteConfigForm } from './SiteConfigForm.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Índice de seções da configuração do site em Chromium (#594): a partir de `xl`, coluna ao
// lado dos cartões, fixa abaixo do cabeçalho ao rolar, com a seção visível em `aria-current`;
// abaixo de `xl`, no topo, antes da primeira seção.

const config: SiteConfig = {
  siteId: 'exemplo-c',
  name: 'Exemplo C',
  domains: ['c.example.com'],
  language: 'pt-BR',
  timeZone: 'America/Sao_Paulo',
  indexavel: false,
  theme: 'exemplo-a',
  presets: { home: 'revista', artigo: 'padrao', categoria: 'padrao', autor: 'padrao' },
  variants: { articleCard: 'horizontal' },
  featureFlags: { busca: true },
  crawlers: {},
  integrations: { ga4: { enabled: true, measurementId: 'G-ABC123' } },
};

async function renderConfig() {
  const screen = await renderInFrame(
    <section aria-labelledby="titulo" className="space-y-4">
      <h1 id="titulo">Configuração do site</h1>
      <SiteConfigForm
        mode="edit"
        defaultValues={editValues({ ...config, institutionalTexts: { about: [] } })}
        options={{
          presets: RESOURCES.presets,
          variants: RESOURCES.variants,
          themes: THEME_SUMMARIES,
        }}
        action={() => Promise.resolve({ ok: true, message: '' })}
        backHref="/sites/exemplo-c"
        contentClassName="form-width"
      />
    </section>,
  );
  return {
    nav: screen.getByRole('navigation', { name: 'Seções do formulário' }),
    region: (name: string) => screen.getByRole('region', { name }).element() as HTMLElement,
  };
}

const rect = (element: Element) => element.getBoundingClientRect();

afterEach(() => {
  window.scrollTo(0, 0);
});

describe('índice de seções da configuração do site (#594)', () => {
  it('a 1440 px: ao lado dos cartões, fixo ao rolar e com a seção visível marcada', async () => {
    await page.viewport(1440, 900);
    const { nav, region } = await renderConfig();
    const element = nav.element();

    expect(getComputedStyle(element).position).toBe('sticky');
    expect(rect(element).left).toBeGreaterThanOrEqual(rect(region('Identidade')).right);
    await expect
      .element(nav.getByRole('link', { name: 'Identidade' }))
      .toHaveAttribute('aria-current', 'true');

    region('Aparência').scrollIntoView({ block: 'start' });
    window.scrollBy(0, -HEADER_HEIGHT - 16);
    await expect
      .element(nav.getByRole('link', { name: 'Aparência' }))
      .toHaveAttribute('aria-current', 'true');

    // No fim da página, a última seção inteira à vista é a marcada.
    region('Integrações').scrollIntoView({ block: 'start' });
    await expect
      .element(nav.getByRole('link', { name: 'Integrações' }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(nav.getByRole('link', { name: 'Identidade' }))
      .not.toHaveAttribute('aria-current');
    expect(window.scrollY).toBeGreaterThan(0);
    expect(rect(element).top).toBeGreaterThanOrEqual(HEADER_HEIGHT);
    expect(rect(element).bottom).toBeLessThanOrEqual(window.innerHeight);
  });

  it('a 390 px: no topo, antes da primeira seção, sem posição fixa', async () => {
    await page.viewport(390, 844);
    const { nav, region } = await renderConfig();
    const element = nav.element();

    expect(getComputedStyle(element).position).toBe('static');
    expect(rect(element).bottom).toBeLessThanOrEqual(rect(region('Identidade')).top);
  });

  it.each(COLOR_SCHEMES)('sem violação do axe no índice (%s)', async (scheme) => {
    await setTheme(scheme);
    await page.viewport(1440, 900);
    const { nav } = await renderConfig();

    expect(await audit(nav)).toEqual([]);
  });
});
