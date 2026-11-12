import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentVersionsTable } from '@/components/contents/ContentVersionsTable';
import { ReviewPanel } from '@/components/review/ReviewPanel';
import { LifecycleAction } from '@/components/sites/SiteActions';
import { SitePublicationTab } from '@/components/sites/SitePublicationTab';
import { SiteSummaryCard } from '@/components/sites/SiteSummaryCard';
import { SiteTabs } from '@/components/sites/SiteTabs';
import Card from '@/components/ui/Card';
import type { SiteActivity, SiteHistoryItem } from '@/domain/builds/builds.ts';
import { REVIEW_CHECKLIST } from '@/domain/reviews/reviews.ts';
import type { SiteInfraCheck, SiteInstance, SiteSummary } from '@/domain/sites/sites.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { renderInFrame } from '../../../test/browser/render.tsx';
import { DETAIL_SUMMARY_CLASS, DETAIL_SUMMARY_LIST_CLASS } from './detailSummary.ts';
import { DetailLayout } from './DetailLayout.tsx';
import { InfoField, InfoList } from './InfoList.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Grade das telas de detalhe em Chromium (#460; antes no E2E: `sites.spec.ts`, `contents.spec.ts`
// e `revisao.spec.ts`, #370, #371, #373): na moldura do admin, as três telas montam a grade com o
// componente, cada uma com as peças dela, e o axe roda nos dois temas. As medidas por largura
// saíram (ADR 0020).

const SITE: SiteSummary = {
  id: 'exemplo-a',
  name: 'Exemplo A — Guias',
  domain: 'exemplo-a.example.com',
  lifecycle: 'publicado',
  state: 'ativo',
  pausedReason: null,
  pausedCulprit: null,
  activeVersionId: null,
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
  dailyPublishLimit: null,
  effectiveDailyPublishLimit: 10,
  publishedToday: 0,
  timeZone: 'America/Sao_Paulo',
};

const INSTANCE: SiteInstance = {
  recentBuilds: [
    {
      id: 2,
      status: 'failed',
      release: '1.4.0',
      versionId: null,
      finishedAt: new Date('2026-10-20T13:00:00.000Z'),
    },
    {
      id: 1,
      status: 'ok',
      release: '1.4.0',
      versionId: 'v-0123456789abcdef',
      finishedAt: new Date('2026-10-20T12:00:00.000Z'),
    },
  ],
  activeFiles: 412,
  activePages: 120,
  activeSince: { at: new Date('2026-10-20T12:00:00.000Z'), by: 'ana@orakel.local' },
  pendingByOrigin: [
    { origin: 'content', count: 3 },
    { origin: 'redirect', count: 1 },
  ],
};

/** O histórico da aba "Publicação" (#637, #647): uma falha e uma pausa. */
const HISTORY: SiteHistoryItem[] = [
  {
    type: 'execucao',
    id: 2,
    kind: 'build',
    status: 'failed',
    requestedBy: 'system',
    cancelRequestedBy: null,
    at: new Date('2026-10-20T13:00:00.000Z'),
    release: '1.4.0',
    versionId: null,
    failure: { stage: 'render', kind: 'permanent', message: 'falhou', logTail: 'exit 1' },
  },
  {
    type: 'evento',
    id: 1,
    kind: 'pausa',
    requestedBy: 'system',
    at: new Date('2026-10-20T12:30:00.000Z'),
    reason: 'falha permanente',
    previousRelease: null,
    release: null,
  },
];

/** A aba "Publicação" (#647) com uma publicação rodando: painel, faixa ao vivo e histórico. */
const ACTIVITY: SiteActivity = {
  open: {
    id: 3,
    kind: 'build',
    status: 'rodando',
    currentStage: 'render',
    scheduledFor: null,
    startedAt: new Date('2026-10-20T13:10:00.000Z'),
    requestedBy: 'ana@orakel.local',
    cancelRequestedAt: null,
  },
  history: HISTORY,
};

/** Slug longo e sem hífen (#371): tem de quebrar dentro do cartão em vez de passar da borda. */
const SLUG = `/detalhe${'x'.repeat(90)}1761000000000`;

/** Título longo de versão (#588): vai cortado sob a versão, sem empurrar a tabela para fora. */
const LONG_TITLE = `Como montar uma horta vertical em apartamento pequeno ${'com pouca luz '.repeat(6)}`;

/** A última conferência da infra (workspace#85), sem nenhuma na fila. */
const INFRA_CHECK: SiteInfraCheck = {
  lifecycle: 'infra_aplicada',
  checkedAt: new Date(),
  error: null,
  queued: false,
};

/** A tela do site: o resumo à esquerda das abas. */
function SiteDetail() {
  return (
    <section className="list-width space-y-4">
      <DetailLayout>
        <SiteSummaryCard site={SITE} instance={INSTANCE} g1Registered />
        <SiteTabs
          publication={
            <SitePublicationTab
              site={{ ...SITE, lifecycle: 'infra_aplicada' }}
              instance={INSTANCE}
              activity={ACTIVITY}
              status={() => Promise.resolve(ACTIVITY)}
              infraCheck={{ check: INFRA_CHECK, now: new Date() }}
              infraCheckStatus={() => Promise.resolve(INFRA_CHECK)}
              lifecycleAction={
                <LifecycleAction
                  lifecycle="infra_aplicada"
                  check={() => Promise.resolve({ ok: true, message: '' })}
                  undo={() => Promise.resolve({ ok: true, message: '' })}
                />
              }
            />
          }
          g1={<p>Registro no G1.</p>}
          buildWindow={<p>Janela de agrupamento.</p>}
          dailyLimit={<p>Limite diário.</p>}
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
              {
                version: 2,
                status: 'aprovado',
                title: LONG_TITLE,
                createdAt: new Date('2026-10-21T12:00Z'),
                approval: {
                  reviewer: 'revisora.editorial@orakel.local',
                  approvedAt: new Date('2026-10-21T15:30Z'),
                },
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
            giveBack={() => Promise.resolve({ ok: true as const, message: 'ok' })}
          />
        </div>
      </DetailLayout>
    </section>
  );
}

beforeEach(() => {
  navigation.set('/sites/exemplo-a');
});

afterEach(() => {
  navigation.set('/');
});

describe('DetailLayout no navegador', () => {
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
