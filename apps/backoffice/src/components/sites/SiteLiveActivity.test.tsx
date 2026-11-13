// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ExecutionHistoryItem,
  OpenExecution,
  SiteActivity,
  SiteHistoryItem,
} from '@/domain/builds/builds.ts';
import type { InfraHistoryItem, OpenInfraRun } from '@/domain/infra/runs.ts';

import { SiteLiveActivity, type SiteActivityStatus } from './SiteLiveActivity.tsx';

// Status ao vivo da aba "Histórico" (#638): a faixa mostra a execução aberta e, quando ela
// fecha, o resultado, relendo a atividade pela Server Action só enquanto há execução aberta.
// A faixa é uma região viva (`role="status"`) montada desde o primeiro render.

const POLL_MS = 100;
const TZ = 'America/Sao_Paulo';

const PAUSE: SiteHistoryItem = {
  type: 'evento',
  id: 1,
  kind: 'pausa',
  requestedBy: 'system',
  at: new Date('2026-10-11T15:00:00Z'),
  reason: 'falha permanente',
  previousRelease: null,
  release: null,
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
  status: 'failed',
  requestedBy: 'ana@orakel.local',
  cancelRequestedBy: null,
  at: new Date('2026-10-11T17:05:00Z'),
  release: '1.3.0',
  versionId: null,
  failure: { stage: 'render', kind: 'permanent', message: 'astro saiu com 1', logTail: null },
};

const status = vi.fn<SiteActivityStatus>();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

function renderLive(activity: SiteActivity) {
  return render(
    <SiteLiveActivity activity={activity} status={status} timeZone={TZ} pollMs={POLL_MS} />,
  );
}

const tick = () => act(() => vi.advanceTimersByTimeAsync(POLL_MS));
const region = () => screen.getByRole('status');

beforeEach(() => {
  vi.useFakeTimers();
  status.mockReset();
  refresh.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SiteLiveActivity', () => {
  it('acompanha a execução da fila ao resultado, sem recarregar a página', async () => {
    status
      .mockResolvedValueOnce({ open: running, openInfra: null, history: [PAUSE] })
      .mockResolvedValueOnce({ open: null, openInfra: null, history: [finished, PAUSE] });
    renderLive({ open: queued, openInfra: null, history: [PAUSE] });

    expect(region().textContent).toBe('Publicação na fila, prevista para 11/10/2026, 14:00 BRT');
    await tick();
    expect(region().textContent).toBe('Publicação em andamento, etapa: Renderização');
    await tick();
    expect(region().textContent).toBe('Publicação falhou em 11/10/2026, 14:05 BRT');
  });

  it('a linha do tempo do histórico passa a mostrar a execução que terminou', async () => {
    status.mockResolvedValue({ open: null, openInfra: null, history: [finished, PAUSE] });
    renderLive({ open: running, openInfra: null, history: [PAUSE] });

    expect(within(screen.getByRole('list')).queryByText('Falhou')).toBeNull();
    await tick();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText(/^Publicação/)).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText('Falhou')).toBeTruthy();
  });

  it('sem execução aberta, não consulta a Server Action nem mostra faixa', async () => {
    renderLive({ open: null, openInfra: null, history: [finished, PAUSE] });

    expect(region().textContent).toBe('');
    expect(vi.getTimerCount()).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 10));
    expect(status).not.toHaveBeenCalled();
  });

  it('depois que a execução fecha, as consultas param', async () => {
    status.mockResolvedValue({ open: null, openInfra: null, history: [finished, PAUSE] });
    renderLive({ open: running, openInfra: null, history: [PAUSE] });

    await tick();
    expect(status).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 10));
    expect(status).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uma leitura recusada mantém o que está na tela e tenta de novo', async () => {
    status
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ open: running, openInfra: null, history: [PAUSE] });
    renderLive({ open: queued, openInfra: null, history: [PAUSE] });

    await tick();
    expect(region().textContent).toContain('na fila');
    await tick();
    expect(region().textContent).toContain('em andamento');
  });

  it('a região viva fica no mesmo nó e troca o texto a cada mudança de estado', async () => {
    status.mockResolvedValue({ open: running, openInfra: null, history: [PAUSE] });
    renderLive({ open: queued, openInfra: null, history: [PAUSE] });

    const before = region();
    await tick();
    expect(region()).toBe(before);
    expect(before.textContent).toContain('em andamento');
  });

  it('dados novos da página substituem os do polling', async () => {
    const { rerender } = renderLive({ open: null, openInfra: null, history: [PAUSE] });
    expect(status).not.toHaveBeenCalled();

    status.mockResolvedValue({ open: running, openInfra: null, history: [PAUSE] });
    rerender(
      <SiteLiveActivity
        activity={{ open: queued, openInfra: null, history: [PAUSE] }}
        status={status}
        timeZone={TZ}
        pollMs={POLL_MS}
      />,
    );
    expect(region().textContent).toContain('na fila');
    await tick();
    expect(status).toHaveBeenCalledTimes(1);
    expect(region().textContent).toContain('em andamento');
  });
});

describe('SiteLiveActivity na criação da infraestrutura (#826)', () => {
  const applying: OpenInfraRun = {
    id: 4,
    kind: 'criar',
    status: 'aplicando',
    currentStep: 'endereco',
    planSummary: null,
    requestedBy: 'operacao@orakel.local',
    requestedAt: new Date('2026-10-11T16:58:00Z'),
    confirmedBy: 'operacao@orakel.local',
  };
  const closed = (over: Partial<InfraHistoryItem>): InfraHistoryItem => ({
    type: 'infra',
    id: 4,
    kind: 'criar',
    status: 'ok',
    requestedBy: 'operacao@orakel.local',
    requestedAt: new Date('2026-10-11T16:58:00Z'),
    confirmedBy: 'operacao@orakel.local',
    at: new Date('2026-10-11T17:05:00Z'),
    nameservers: ['ada.ns.example', 'bob.ns.example'],
    failure: null,
    ...over,
  });
  const idle = (over: Partial<SiteActivity>): SiteActivity => ({
    open: null,
    openInfra: null,
    history: [PAUSE],
    ...over,
  });

  it('acompanha as etapas aplicando até concluir e relê a página no fim', async () => {
    status
      .mockResolvedValueOnce(idle({ openInfra: { ...applying, currentStep: 'dns' } }))
      .mockResolvedValueOnce(idle({ history: [closed({}), PAUSE] }));
    renderLive(idle({ openInfra: applying }));

    expect(region().textContent).toBe('Criação da infraestrutura em andamento, etapa: Endereço');
    await tick();
    expect(region().textContent).toBe(
      'Criação da infraestrutura em andamento, etapa: Registros de DNS',
    );
    expect(refresh).not.toHaveBeenCalled();
    await tick();
    expect(region().textContent).toBe(
      'Criação da infraestrutura concluída em 11/10/2026, 14:05 BRT',
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 10));
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('na falha, a faixa diz a etapa e o motivo', async () => {
    status.mockResolvedValue(
      idle({
        history: [
          closed({
            status: 'falhou',
            nameservers: null,
            failure: { step: 'regras', message: 'Falha simulada' },
          }),
          PAUSE,
        ],
      }),
    );
    renderLive(idle({ openInfra: { ...applying, currentStep: 'regras' } }));

    await tick();
    expect(region().textContent).toBe(
      'Criação da infraestrutura falhou na etapa Regras em 11/10/2026, 14:05 BRT: Falha simulada',
    );
  });

  it('o plano preparando ou aguardando confirmação não liga o polling da aba', async () => {
    renderLive(idle({ openInfra: { ...applying, status: 'aguardando_confirmacao' } }));

    expect(region().textContent).toBe('');
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 10));
    expect(status).not.toHaveBeenCalled();
  });

  it('a criação vista aguardando confirmação que a página entrega já fechada mostra o resultado', () => {
    const { rerender } = renderLive(
      idle({ openInfra: { ...applying, status: 'aguardando_confirmacao', currentStep: null } }),
    );
    rerender(
      <SiteLiveActivity
        activity={idle({ history: [closed({}), PAUSE] })}
        status={status}
        timeZone={TZ}
        pollMs={POLL_MS}
      />,
    );

    expect(region().textContent).toBe(
      'Criação da infraestrutura concluída em 11/10/2026, 14:05 BRT',
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('sem criação acompanhada, uma já terminada no histórico não mostra faixa nem relê', () => {
    renderLive(idle({ history: [closed({}), PAUSE] }));

    expect(region().textContent).toBe('');
    expect(refresh).not.toHaveBeenCalled();
  });
});
