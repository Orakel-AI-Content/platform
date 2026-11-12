// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReleaseRecord } from '@/domain/releases/releases.ts';
import type { Rollout } from '@/domain/releases/rollout.ts';

import { ReleasesView } from './ReleasesView.tsx';
import type { ReleasesSnapshot } from './useReleasesSnapshot.ts';

// Tela de Releases (#703): o mesmo polling leva o avanço ao cartão e reabilita o botão
// "Atualizar todos os sites" quando a atualização fecha, sem recarregar; fechada, o polling para
// e o cartão continua. Sem atualização, nenhum cartão.

vi.mock('next/navigation', () => ({
  usePathname: () => '/releases',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const release: ReleaseRecord = {
  tag: '1.5.0',
  registeredAt: new Date('2026-11-10T12:00Z'),
  imageStatus: null,
  imageCheckedAt: null,
  pipelineState: 'disponivel',
  runId: null,
  runUrl: null,
  failureReason: null,
  requestedBy: null,
};

const rollout = (
  state: Rollout['state'],
  sites: [string, Rollout['sites'][number]['state']][],
): Rollout => ({
  id: 1,
  targetRelease: '1.5.0',
  state,
  requestedBy: 'operacao@orakel.local',
  startedAt: new Date('2026-11-12T12:00Z'),
  finishedAt: null,
  sites: sites.map(([siteId, siteState], position) => ({
    siteId,
    position,
    state: siteState,
    previousRelease: '1.4.0',
  })),
});

const snapshot = (value: Rollout | null): ReleasesSnapshot => ({
  rows: [release],
  inUse: [],
  preview: {
    status: 'no_ar',
    currentRelease: '1.5.0',
    targetRelease: null,
    failureReason: null,
    updatedAt: new Date('2026-11-12T12:00Z'),
  },
  rollout: value,
  rolloutTarget: '1.5.0',
});

const view = (initial: ReleasesSnapshot, status?: () => Promise<ReleasesSnapshot | undefined>) => (
  <ReleasesView
    snapshot={initial}
    generate={<button type="button">Gerar nova versão</button>}
    startRollout={vi.fn()}
    retry={vi.fn()}
    discard={vi.fn()}
    status={status}
    pollMs={1000}
    titleId="releases-title"
  />
);

const updateAll = () => screen.getByRole('button', { name: 'Atualizar todos os sites' });
const summary = () => screen.getByRole('status', { name: 'Progresso da atualização' }).textContent;

describe('ReleasesView', () => {
  it('sem atualização, sem cartão e com o botão habilitado ao lado de Gerar nova versão', () => {
    render(view(snapshot(null)));

    expect(screen.queryByRole('list', { name: 'Sites da atualização' })).toBeNull();
    expect(updateAll()).toHaveProperty('disabled', false);
    expect(screen.getAllByRole('button', { name: 'Gerar nova versão' }).length).toBeGreaterThan(0);
  });

  it('o polling avança o cartão e, fechada a atualização, reabilita o botão e para', async () => {
    vi.useFakeTimers();
    const status = vi
      .fn()
      .mockResolvedValueOnce(
        snapshot(
          rollout('em_andamento', [
            ['site-a', 'atualizado'],
            ['site-b', 'em_andamento'],
          ]),
        ),
      )
      .mockResolvedValueOnce(
        snapshot(
          rollout('concluida', [
            ['site-a', 'atualizado'],
            ['site-b', 'atualizado'],
          ]),
        ),
      );
    render(
      view(
        snapshot(
          rollout('em_andamento', [
            ['site-a', 'em_andamento'],
            ['site-b', 'aguardando'],
          ]),
        ),
        status,
      ),
    );
    expect(summary()).toBe('Atualização para 1.5.0 · em andamento · 1 de 2');
    expect(updateAll()).toHaveProperty('disabled', true);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(summary()).toBe('Atualização para 1.5.0 · em andamento · 2 de 2');

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(summary()).toBe('Atualização para 1.5.0 · concluída · 2 de 2');
    expect(updateAll()).toHaveProperty('disabled', false);

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(status).toHaveBeenCalledTimes(2);
    expect(summary()).toBe('Atualização para 1.5.0 · concluída · 2 de 2');
  });
});
