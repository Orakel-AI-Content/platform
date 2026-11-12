// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ExecutionHistoryItem,
  OpenExecution,
  SiteActivity,
  SiteHistoryItem,
} from '@/domain/builds/builds.ts';

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
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SiteLiveActivity', () => {
  it('acompanha a execução da fila ao resultado, sem recarregar a página', async () => {
    status
      .mockResolvedValueOnce({ open: running, history: [PAUSE] })
      .mockResolvedValueOnce({ open: null, history: [finished, PAUSE] });
    renderLive({ open: queued, history: [PAUSE] });

    expect(region().textContent).toBe('Publicação na fila, prevista para 11/10/2026, 14:00 BRT');
    await tick();
    expect(region().textContent).toBe('Publicação em andamento, etapa: Renderização');
    await tick();
    expect(region().textContent).toBe('Publicação falhou em 11/10/2026, 14:05 BRT');
  });

  it('a linha do tempo do histórico passa a mostrar a execução que terminou', async () => {
    status.mockResolvedValue({ open: null, history: [finished, PAUSE] });
    renderLive({ open: running, history: [PAUSE] });

    expect(within(screen.getByRole('list')).queryByText('Falhou')).toBeNull();
    await tick();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText(/^Publicação/)).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText('Falhou')).toBeTruthy();
  });

  it('sem execução aberta, não consulta a Server Action nem mostra faixa', async () => {
    renderLive({ open: null, history: [finished, PAUSE] });

    expect(region().textContent).toBe('');
    expect(vi.getTimerCount()).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 10));
    expect(status).not.toHaveBeenCalled();
  });

  it('depois que a execução fecha, as consultas param', async () => {
    status.mockResolvedValue({ open: null, history: [finished, PAUSE] });
    renderLive({ open: running, history: [PAUSE] });

    await tick();
    expect(status).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 10));
    expect(status).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uma leitura recusada mantém o que está na tela e tenta de novo', async () => {
    status.mockResolvedValueOnce(null).mockResolvedValueOnce({ open: running, history: [PAUSE] });
    renderLive({ open: queued, history: [PAUSE] });

    await tick();
    expect(region().textContent).toContain('na fila');
    await tick();
    expect(region().textContent).toContain('em andamento');
  });

  it('a região viva fica no mesmo nó e troca o texto a cada mudança de estado', async () => {
    status.mockResolvedValue({ open: running, history: [PAUSE] });
    renderLive({ open: queued, history: [PAUSE] });

    const before = region();
    await tick();
    expect(region()).toBe(before);
    expect(before.textContent).toContain('em andamento');
  });

  it('dados novos da página substituem os do polling', async () => {
    const { rerender } = renderLive({ open: null, history: [PAUSE] });
    expect(status).not.toHaveBeenCalled();

    status.mockResolvedValue({ open: running, history: [PAUSE] });
    rerender(
      <SiteLiveActivity
        activity={{ open: queued, history: [PAUSE] }}
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
