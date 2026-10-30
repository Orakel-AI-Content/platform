import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { DETAIL_SUMMARY_CLASS } from '@/components/shared/detailSummary.ts';
import { DetailLayout } from '@/components/shared/DetailLayout';
import Card from '@/components/ui/Card';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { cellsOverLines, pageOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';
import { ContentVersionsTable, type ContentVersionRow } from './ContentVersionsTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Versões de um conteúdo em Chromium (#460; antes no E2E, `contents.spec.ts`, #366, #371): no
// cartão "Versões", ao lado do resumo, a 1280 px, na moldura do admin. A página não rola na
// horizontal (a tabela rola só dentro do próprio contêiner, como no `CustomerDetails` do Ecme) e
// nenhuma célula passa de duas linhas, com título longo; o filtro de status vai para a URL, e
// remontar mantém a visão. O axe roda nos dois temas. Sem aprovação, como no seed do E2E: a
// célula de aprovação (revisor e data) chega a três linhas, um defeito que o E2E também não
// cobria (fica para uma issue própria, #460 não muda o visual).

const SITE = 'exemplo-a';
const CONTENT = 42;
const PATH = `/sites/${SITE}/conteudos/${CONTENT}`;

const ROWS: ContentVersionRow[] = [
  {
    version: 1,
    status: 'publicado',
    title: 'Guia completo de receitas regionais brasileiras para o dia a dia da família',
    createdAt: new Date('2026-10-18T12:00Z'),
    approval: null,
  },
  {
    version: 2,
    status: 'em_revisao',
    title: 'Guia completo de receitas regionais',
    createdAt: new Date('2026-10-20T12:00Z'),
    approval: null,
  },
  {
    version: 3,
    status: 'rascunho',
    title: 'Guia de receitas',
    createdAt: new Date('2026-10-21T12:00Z'),
    approval: null,
  },
];

function Versions() {
  return (
    <section className="list-width space-y-4">
      <DetailLayout>
        <Card className={DETAIL_SUMMARY_CLASS}>
          <p>Resumo do conteúdo.</p>
        </Card>
        <Card className="w-full min-w-0" bodyClass="flex flex-col gap-4">
          <h2 id="versions-title">Versões</h2>
          <ContentVersionsTable
            siteId={SITE}
            contentId={CONTENT}
            timeZone="America/Sao_Paulo"
            labelledBy="versions-title"
            rows={ROWS}
          />
        </Card>
      </DetailLayout>
    </section>
  );
}

const table = () => page.getByRole('table', { name: 'Versões', exact: true });
const resultCount = () => page.getByRole('status').filter({ hasText: /resultados?$/ });

beforeEach(() => {
  navigation.set(PATH);
});

afterEach(() => {
  navigation.set('/');
});

describe('ContentVersionsTable no navegador', () => {
  it('ao lado do resumo a 1280 px, sem rolar a página e com até duas linhas por célula', async () => {
    await renderInFrame(<Versions />);
    await expect
      .element(table().getByRole('link', { name: 'Versão 1', exact: true }))
      .toHaveAttribute('href', `${PATH}/versoes/1`);

    expect(pageOverflow()).toBe(0);
    expect(getComputedStyle(table().element().parentElement!).overflowX).toBe('auto');
    expect(cellsOverLines(table())).toEqual([]);
  });

  it('o filtro de status vai para a URL, e remontar mantém a mesma visão', async () => {
    const screen = await renderInFrame(<Versions />);
    (page.getByRole('combobox', { name: 'Status' }).element() as HTMLElement).focus();
    await userEvent.keyboard('{ArrowDown}');
    await page.getByRole('option', { name: 'Agendado', exact: true }).click();
    await expect.poll(() => navigation.search()).toBe('status=agendado');
    await expect.element(table().getByText('Nenhuma versão encontrada.')).toBeVisible();

    await screen.unmount();
    await renderInFrame(<Versions />);
    await expect.element(table().getByText('Nenhuma versão encontrada.')).toBeVisible();
    await expect.element(resultCount()).toHaveTextContent('0 resultados');
  });

  it.each(COLOR_SCHEMES)('sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Versions />);
    expect(await audit()).toEqual([]);
  });
});
