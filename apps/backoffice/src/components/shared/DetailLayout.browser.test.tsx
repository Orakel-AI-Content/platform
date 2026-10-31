import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import { ContentVersionsTable } from '@/components/contents/ContentVersionsTable';
import { ReviewPanel } from '@/components/review/ReviewPanel';
import { SiteSummaryCard } from '@/components/sites/SiteSummaryCard';
import { SiteTabs } from '@/components/sites/SiteTabs';
import Card from '@/components/ui/Card';
import { REVIEW_CHECKLIST } from '@/domain/reviews/reviews.ts';
import type { SiteSummary } from '@/domain/sites/sites.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { pageOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';
import { DETAIL_SUMMARY_CLASS, DETAIL_SUMMARY_LIST_CLASS } from './detailSummary.ts';
import { DetailLayout } from './DetailLayout.tsx';
import { InfoField, InfoList } from './InfoList.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Grade das telas de detalhe em Chromium (#460; antes no E2E: `sites.spec.ts`, `contents.spec.ts`
// e `revisao.spec.ts`, #370, #371, #373): na moldura do admin, o resumo e o corpo lado a lado a
// 1280 px e um sobre o outro a 1024 e a 375 px, sem rolagem horizontal. As três telas montam a
// grade com o componente, cada uma com as peças dela; o axe roda nos dois temas.

const SITE: SiteSummary = {
  id: 'exemplo-a',
  name: 'Exemplo A — Guias',
  domain: 'exemplo-a.example.com',
  lifecycle: 'publicado',
  state: 'ativo',
  pausedReason: null,
  release: '2026.10.1',
  indexavel: true,
  pendingChanges: 2,
  lastBuild: {
    status: 'ok',
    versionId: '3f9c2a7e-5b1d',
    finishedAt: new Date('2026-10-20T12:00Z'),
  },
  buildWindowSeconds: null,
  effectiveBuildWindowSeconds: 300,
  timeZone: 'America/Sao_Paulo',
};

/** Slug longo e sem hífen (#371): tem de quebrar dentro do cartão em vez de passar da borda. */
const SLUG = `/detalhe${'x'.repeat(90)}1761000000000`;

const box = (element: Element) => element.getBoundingClientRect();

/** A tela do site: o resumo à esquerda das abas. */
function SiteDetail() {
  return (
    <section className="list-width space-y-4">
      <DetailLayout>
        <SiteSummaryCard
          site={SITE}
          g1Registered
          publish={() => Promise.resolve({ ok: true as const, message: 'ok' })}
        />
        <SiteTabs
          lifecycle={<p>Etapas do ciclo de vida.</p>}
          g1={<p>Registro no G1.</p>}
          buildWindow={<p>Janela de agrupamento.</p>}
        />
      </DetailLayout>
    </section>
  );
}

/** A tela do conteúdo: o resumo à esquerda do cartão de versões. */
function ContentDetail() {
  return (
    <section className="list-width space-y-4">
      <DetailLayout>
        <Card className={DETAIL_SUMMARY_CLASS}>
          <InfoList className={DETAIL_SUMMARY_LIST_CLASS}>
            <InfoField label="Tipo">Artigo</InfoField>
            <InfoField label="ID">42</InfoField>
            <InfoField label="Slug">{SLUG}</InfoField>
            <InfoField label="Status">Rascunho</InfoField>
          </InfoList>
        </Card>
        <Card className="w-full min-w-0" bodyClass="flex flex-col gap-4">
          <h2 id="versions-title">Versões</h2>
          <ContentVersionsTable
            siteId="exemplo-a"
            contentId={42}
            timeZone="America/Sao_Paulo"
            labelledBy="versions-title"
            rows={[
              {
                version: 1,
                status: 'rascunho',
                title: 'Detalhe',
                createdAt: new Date('2026-10-20T12:00Z'),
                approval: null,
              },
            ]}
          />
        </Card>
      </DetailLayout>
    </section>
  );
}

/** A tela de revisão: a prévia num cartão, com o painel à direita. */
function ReviewDetail() {
  return (
    <section aria-label="Revisão" className="list-width space-y-4">
      <DetailLayout>
        <Card className="w-full min-w-0">
          <iframe title="Visualização do artigo no site" className="h-[75vh] w-full" />
        </Card>
        <div className={DETAIL_SUMMARY_CLASS}>
          <ReviewPanel
            version={1}
            status="em_revisao"
            issues={[]}
            checklist={REVIEW_CHECKLIST.map(({ key, label }) => ({ key, label }))}
            canApprove
            approve={() => Promise.resolve({ ok: true as const, message: 'ok' })}
          />
        </div>
      </DetailLayout>
    </section>
  );
}

/** Os dois cartões da grade, na ordem do DOM. */
function columns(): [Element, Element] {
  const grid = document.querySelector('main section > div')!;
  const [first, second] = [...grid.children];
  return [first!, second!];
}

/** Lado a lado (o segundo à direita do primeiro, no mesmo topo) ou empilhados. */
function expectSideBySide(sideBySide: boolean) {
  const [first, second] = columns().map(box) as [DOMRect, DOMRect];
  if (sideBySide) {
    expect(second.x).toBeGreaterThanOrEqual(first.right);
    expect(Math.abs(second.y - first.y)).toBeLessThan(1);
  } else {
    expect(second.y).toBeGreaterThanOrEqual(first.bottom);
  }
}

const WIDTHS = [
  [1280, true],
  [1024, false],
  [375, false],
] as const;

beforeEach(() => {
  navigation.set('/sites/exemplo-a');
});

afterEach(() => {
  navigation.set('/');
});

describe('DetailLayout no navegador', () => {
  it.each(WIDTHS)('tela do site a %i px: lado a lado só a partir de xl', async (width, side) => {
    await page.viewport(width, 800);
    await renderInFrame(<SiteDetail />, { roles: ['operacao'] });
    expectSideBySide(side);
    expect(pageOverflow()).toBe(0);
  });

  it.each(WIDTHS)('tela do conteúdo a %i px: o slug quebra no cartão', async (width, side) => {
    await page.viewport(width, 800);
    const screen = await renderInFrame(<ContentDetail />);
    expectSideBySide(side);
    expect(pageOverflow()).toBe(0);
    const slug = screen.getByText(SLUG, { exact: true }).element();
    expect(box(slug).right).toBeLessThanOrEqual(box(columns()[0]).right);
  });

  it.each(WIDTHS)('tela de revisão a %i px: o painel com 330 px ao lado', async (width, side) => {
    await page.viewport(width, 900);
    await renderInFrame(<ReviewDetail />, { roles: ['revisor'] });
    expectSideBySide(side);
    expect(pageOverflow()).toBe(0);
    const [card, panel] = columns().map(box) as [DOMRect, DOMRect];
    if (side) expect(panel.width).toBeGreaterThanOrEqual(330);
    // Empilhada, a prévia ocupa a largura útil do main (a da seção).
    const section = box(document.querySelector('main section')!);
    if (!side) expect(Math.abs(card.width - section.width)).toBeLessThanOrEqual(1);
  });

  it.each(COLOR_SCHEMES)('as três telas sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    for (const Detail of [SiteDetail, ContentDetail, ReviewDetail]) {
      const screen = await renderInFrame(<Detail />);
      expect(await audit()).toEqual([]);
      await screen.unmount();
    }
  });
});
