// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionHistoryItem, OpenExecution, SiteActivity } from '@/domain/builds/builds.ts';
import type { SiteInfraCheck } from '@/domain/sites/sites.ts';

import type { InfraCheckView, SiteInfraCheckStatus } from './LifecycleSteps.tsx';
import { LifecycleAction } from './SiteActions.tsx';

import type { SiteActivityStatus } from './SiteLiveActivity.tsx';
import type { PublicationSite, PublicationStepActions } from './SitePublicationSteps.tsx';
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
const infraStatus = vi.fn<SiteInfraCheckStatus>();
const refresh = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const NOW = new Date('2026-11-12T12:00:00Z');
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

/** Site publicado, conferido antes da conferência automática nunca ter rodado. */
const DONE: SiteInfraCheck = {
  lifecycle: 'publicado',
  checkedAt: null,
  error: null,
  queued: false,
};

function tab(
  activity: SiteActivity,
  actions?: PublicationStepActions,
  infraCheck: InfraCheckView = { check: DONE, now: NOW },
  lifecycleAction = <button type="button">Desmarcar zona ativa</button>,
) {
  return (
    <SitePublicationTab
      site={SITE}
      instance={{ activePages: 120, activeSince: null }}
      activity={activity}
      status={status}
      infraCheck={infraCheck}
      infraCheckStatus={infraStatus}
      lifecycleAction={lifecycleAction}
      actions={actions}
      pollMs={POLL_MS}
    />
  );
}

function renderTab(activity: SiteActivity, actions?: PublicationStepActions) {
  return render(tab(activity, actions));
}

const panel = () => screen.getByRole('list', { name: 'Etapas da publicação' });
const buildStep = () =>
  within(panel()).getAllByRole('listitem')[2]?.querySelector('.step-item-description')?.textContent;
const tick = () => act(() => vi.advanceTimersByTimeAsync(POLL_MS));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  status.mockReset();
  infraStatus.mockReset();
  refresh.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('aba Publicação', () => {
  it('mostra o painel em cima e o histórico embaixo', () => {
    renderTab({ open: null, history: [finished] });

    const heading = screen.getByRole('heading', { name: 'Histórico' });
    // O histórico é a linha do tempo fora do painel de etapas (#651).
    const timeline = screen.getAllByRole('list').find((list) => !panel().contains(list));
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(panel(), heading)).toBe(true);
    expect(timeline && follows(heading, timeline)).toBe(true);
    // A ação do ciclo de vida fica na etapa Infra e zona.
    expect(
      within(panel())
        .getAllByRole('listitem')[0]
        ?.contains(screen.getByRole('button', { name: 'Desmarcar zona ativa' })),
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

  it('"Cancelar" acompanha a publicação aberta e sai quando ela fecha (#649)', async () => {
    status
      .mockResolvedValueOnce({ open: running, history: [] })
      .mockResolvedValueOnce({ open: null, history: [finished] });
    renderTab(
      { open: queued, history: [] },
      {
        build: <button type="button">Publicar agora</button>,
        cancel: <button type="button">Cancelar</button>,
      },
    );
    const buildButtons = () =>
      within(within(panel()).getAllByRole('listitem')[2]!)
        .queryAllByRole('button')
        .map((button) => button.textContent);

    // Na fila, "Publicar agora" pula a janela; em andamento, só "Cancelar".
    expect(buildButtons()).toEqual(['Publicar agora', 'Cancelar']);
    await tick();
    expect(buildButtons()).toEqual(['Cancelar']);
    await tick();
    expect(buildButtons()).toEqual(['Publicar agora']);
  });
});

describe('conferência da infra na etapa Infra e zona (#716)', () => {
  const idle: SiteActivity = { open: null, history: [finished] };
  const infraItem = () => within(panel()).getAllByRole('listitem')[0]!;
  const infraStep = () => infraItem().querySelector('.step-item-description')?.textContent;
  const check = (over: Partial<SiteInfraCheck>): InfraCheckView => ({
    check: { lifecycle: 'cadastrado', checkedAt: null, error: null, queued: false, ...over },
    now: NOW,
  });
  const action = (
    <LifecycleAction
      lifecycle="cadastrado"
      check={() => Promise.resolve({ ok: true, message: '' })}
      undo={() => Promise.resolve({ ok: true, message: '' })}
    />
  );

  it('sem conferência na fila, não consulta', async () => {
    render(tab(idle, undefined, check({ checkedAt: minutesAgo(5) }), action));

    expect(infraStep()).toContain('Zona não encontrada no provedor (conferido há 5 minutos)');
    await tick();
    await tick();
    expect(infraStatus).not.toHaveBeenCalled();
  });

  it('nunca conferido diz "Ainda não conferido"', () => {
    render(tab(idle, undefined, check({}), action));

    expect(infraStep()).toContain('Ainda não conferido');
  });

  it('com conferência na fila, "Conferindo…" até o resultado, sem recarregar; depois para', async () => {
    infraStatus.mockResolvedValueOnce(check({ queued: true }).check).mockResolvedValueOnce({
      lifecycle: 'zona_ativa',
      checkedAt: NOW,
      error: null,
      queued: false,
    });
    render(tab(idle, undefined, check({ queued: true }), action));

    expect(infraStep()).toContain('Conferindo…');
    expect(screen.getByRole('button', { name: 'Conferindo…' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    await tick();
    expect(infraStep()).toContain('Conferindo…');
    expect(refresh).not.toHaveBeenCalled();
    await tick();
    expect(infraStep()).toContain('Infra aplicada e zona ativa');
    expect(infraStep()).toContain('Detectado sozinho (conferido há menos de 1 minuto)');
    expect(infraItem().getAttribute('aria-current')).toBeNull();
    // A etapa avançou: some o "Conferir agora", aparece o "Desmarcar".
    expect(within(infraItem()).queryByRole('button', { name: /Conferir/ })).toBeNull();
    expect(
      within(infraItem()).getByRole('button', { name: 'Desmarcar zona ativa' }),
    ).not.toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);

    await tick();
    await tick();
    expect(infraStatus).toHaveBeenCalledTimes(2);
  });

  it('a conferência nova da página (depois de "Conferir agora") liga o polling', async () => {
    infraStatus.mockResolvedValue(check({ checkedAt: NOW }).check);
    const { rerender } = render(tab(idle, undefined, check({}), action));
    await tick();
    expect(infraStatus).not.toHaveBeenCalled();

    rerender(tab(idle, undefined, check({ queued: true }), action));
    expect(infraStep()).toContain('Conferindo…');
    await tick();
    expect(infraStatus).toHaveBeenCalledTimes(1);
    expect(infraStep()).toContain('Zona não encontrada no provedor');
  });

  it('com a última conferência em falha, diz que não consultou o provedor e não aparece pendente', () => {
    render(
      tab(
        idle,
        undefined,
        check({ checkedAt: minutesAgo(2), error: 'Cloudflare respondeu 503' }),
        action,
      ),
    );

    expect(infraStep()).toContain(
      'Não foi possível consultar o provedor (conferido há 2 minutos): Cloudflare respondeu 503',
    );
    expect(infraStep()).not.toContain('pendente');
    expect(infraItem().textContent).toContain('(com erro)');
  });
});
