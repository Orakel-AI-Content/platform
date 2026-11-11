import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import { DetailLayout } from '@/components/shared/DetailLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import ButtonLink from '@/components/ui/Button/ButtonLink';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { pageOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';
import { ContentSummary } from './ContentSummary.tsx';
import { ContentViewLinks } from './ContentViewLinks.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Detalhe do conteúdo em Chromium (#597): a 390 px, na moldura do admin, as ações do cabeçalho
// ("Ver prévia", "Ver no site" e "Editar") quebram para baixo do título e a página não rola na
// horizontal; o resumo com autores, taxonomias e datas cabe no cartão; o axe roda nos dois temas.

function Detail() {
  return (
    <section aria-labelledby="content-title" className="list-width space-y-4">
      <PageHeader
        id="content-title"
        title="Como plantar alface em vasos na varanda de apartamento"
        action={
          <>
            <ContentViewLinks
              previewUrl="https://preview.orakel.local/horta-em-casa/como-plantar-alface/"
              publicUrl="https://hortaemcasa.com.br/como-plantar-alface/"
            />
            <ButtonLink href="/sites/horta-em-casa/conteudos/42/editar" variant="solid" size="sm">
              Editar
            </ButtonLink>
          </>
        }
      />
      <DetailLayout>
        <ContentSummary
          contentId={42}
          data={{
            kind: 'article',
            slug: 'como-plantar-alface',
            authorIds: [1, 2],
            taxonomyIds: [3, 4],
            publishedAt: '2026-10-01T12:00:00Z',
          }}
          status="publicado"
          updatedAt={new Date('2026-11-09T18:30:00Z')}
          timeZone="America/Sao_Paulo"
          references={{
            authors: new Map([
              [1, 'Ana Souza'],
              [2, 'Bruno Lima'],
            ]),
            taxonomies: new Map([
              [3, 'Hortas urbanas (categoria)'],
              [4, 'Folhosas (tag)'],
            ]),
          }}
        />
      </DetailLayout>
    </section>
  );
}

beforeEach(() => {
  navigation.set('/sites/horta-em-casa/conteudos/42');
});

afterEach(() => {
  navigation.set('/');
});

describe('detalhe do conteúdo no navegador', () => {
  it('a 390 px, as ações quebram para baixo sem rolar a página', async () => {
    await page.viewport(390, 800);
    const screen = await renderInFrame(<Detail />);
    const links = ['Ver prévia', 'Ver no site', 'Editar'].map((name) =>
      screen.getByRole('link', { name: new RegExp(`^${name}`) }).element(),
    );
    const title = screen.getByRole('heading', { level: 1 }).element().getBoundingClientRect();

    for (const link of links) {
      const box = link.getBoundingClientRect();
      expect(box.top).toBeGreaterThanOrEqual(title.bottom);
      expect(box.right).toBeLessThanOrEqual(document.documentElement.clientWidth);
    }
    expect(pageOverflow()).toBe(0);
  });

  it('a 390 px, o resumo com nomes e datas cabe no cartão', async () => {
    await page.viewport(390, 800);
    const screen = await renderInFrame(<Detail />);
    const value = screen.getByText('Hortas urbanas (categoria), Folhosas (tag)').element();
    const card = value.closest('.card')!.getBoundingClientRect();

    expect(value.getBoundingClientRect().right).toBeLessThanOrEqual(card.right + 1);
    expect(screen.getByText('Ana Souza, Bruno Lima').element()).toBeTruthy();
    expect(screen.getByText('09/11/2026, 15:30 BRT').element()).toBeTruthy();
    expect(pageOverflow()).toBe(0);
  });

  it.each(COLOR_SCHEMES)('a 390 px, sem violação do axe (%s)', async (scheme) => {
    await page.viewport(390, 800);
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Detail />);
    expect(await audit()).toEqual([]);
  });
});
