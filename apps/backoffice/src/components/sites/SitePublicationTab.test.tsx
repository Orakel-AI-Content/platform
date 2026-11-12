// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionHistoryItem, OpenExecution, SiteActivity } from '@/domain/builds/builds.ts';

import type { SiteActivityStatus } from './SiteLiveActivity.tsx';
import type { PublicationSite } from './SitePublicationSteps.tsx';
import { SitePublicationTab } from './SitePublicationTab.tsx';

// Aba "Publicação" (#647): o painel de etapas em cima e o histórico embaixo, na mesma aba, lendo
// a mesma atividade; a etapa Build acompanha o polling sem recarregar a página.

const POLL_MS = 100;

const SITE: PublicationSite = {
  lifecycle: 'publicado',
  release: '1.4.0',
  activeVersionId: 'v41',
  state: 'ativo',
  pausedReason: null,
  timeZone: 'America/Sao_Paulo',
};

const queued: OpenExecution = {
  id: 7,
  kind: 'build',
  status: 'na_fila',
  currentStage: null,
  scheduledFor: new Date('2026-10-11T17:00:00Z'),
  startedAt: null,
  requestedBy: 'ana@orakel.local',
  cancelRequestedAt: null,
};

const running: OpenExecution = {
  ...queued,
  status: 'rodando',
  currentStage: 'render',
  scheduledFor: null,
  startedAt: new Date('2026-10-11T17:00:00Z'),
};

const finished: ExecutionHistoryItem = {
  type: 'execucao',
  id: 7,
  kind: 'build',
  status: 'ok',
  requestedBy: 'ana@orakel.local',
  cancelRequestedBy: null,
  at: new Date('2026-10-11T17:05:00Z'),
  release: '1.4.0',
  versionId: 'v42',
  failure: null,
};

const status = vi.fn<SiteActivityStatus>();

function renderTab(activity: SiteActivity) {
  return render(
    <SitePublicationTab
      site={SITE}
      instance={{ activePages: 120, activeSince: null }}
      activity={activity}
      status={status}
      lifecycleAction={<button type="button">Marcar zona ativa</button>}
      pollMs={POLL_MS}
    />,
  );
}

const panel = () => screen.getByRole('list', { name: 'Etapas da publicação' });
const buildStep = () =>
  within(panel()).getAllByRole('listitem')[2]?.querySelector('.step-item-description')?.textContent;
const tick = () => act(() => vi.advanceTimersByTimeAsync(POLL_MS));

beforeEach(() => {
  vi.useFakeTimers();
  status.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('aba Publicação', () => {
  it('mostra o painel em cima e o histórico embaixo', () => {
    renderTab({ open: null, history: [finished] });

    const heading = screen.getByRole('heading', { name: 'Histórico' });
    const table = screen.getByRole('table', { name: 'Histórico do site' });
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(panel(), heading)).toBe(true);
    expect(follows(heading, table)).toBe(true);
    // A ação do ciclo de vida fica na etapa Infra e zona.
    expect(
      within(panel())
        .getAllByRole('listitem')[0]
        ?.contains(screen.getByRole('button', { name: 'Marcar zona ativa' })),
    ).toBe(true);
  });

  it('a etapa Build acompanha a execução da fila ao resultado, sem recarregar', async () => {
    status
      .mockResolvedValueOnce({ open: running, history: [] })
      .mockResolvedValueOnce({ open: null, history: [finished] });
    renderTab({ open: queued, history: [] });

    expect(buildStep()).toBe('Publicação na fila, prevista para 11/10/2026, 14:00 BRT');
    await tick();
    expect(buildStep()).toBe('Publicação em andamento, etapa: Renderização');
    await tick();
    expect(buildStep()).toBe('Publicação concluída em 11/10/2026, 14:05 BRT');
    // Uma consulta por passo: o painel não tem polling próprio.
    expect(status).toHaveBeenCalledTimes(2);
  });
});
