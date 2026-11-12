// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PreviewState } from '@/domain/preview/preview.ts';
import type { ReleaseRecord } from '@/domain/releases/releases.ts';
import type { Rollout } from '@/domain/releases/rollout.ts';

import { useReleasesSnapshot, type ReleasesSnapshot } from './useReleasesSnapshot.ts';

// Um só polling para a tela de Releases (#703): relê enquanto alguma release está no pipeline
// (#665), a prévia atualiza (#710) ou a atualização de todos os sites está em andamento; os dados
// novos da página substituem os do polling.

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const release = (overrides: Partial<ReleaseRecord> = {}): ReleaseRecord => ({
  tag: '2.0.0',
  registeredAt: new Date('2026-11-06T12:00Z'),
  imageStatus: 'disponivel',
  imageCheckedAt: null,
  pipelineState: 'disponivel',
  runId: null,
  runUrl: null,
  failureReason: null,
  requestedBy: null,
  ...overrides,
});

const preview = (overrides: Partial<PreviewState> = {}): PreviewState => ({
  status: 'no_ar',
  currentRelease: '2.0.0',
  targetRelease: null,
  failureReason: null,
  updatedAt: new Date('2026-11-12T12:00Z'),
  ...overrides,
});

const rollout = (state: Rollout['state']): Rollout => ({
  id: 1,
  targetRelease: '2.0.0',
  state,
  requestedBy: 'operacao@orakel.local',
  startedAt: new Date('2026-11-12T12:00Z'),
  finishedAt: null,
  sites: [],
});

const snapshot = (overrides: Partial<ReleasesSnapshot> = {}): ReleasesSnapshot => ({
  rows: [release()],
  inUse: [],
  preview: preview(),
  rollout: null,
  rolloutTarget: '2.0.0',
  ...overrides,
});

const tick = () => act(() => vi.advanceTimersByTimeAsync(1000));

describe('useReleasesSnapshot', () => {
  it('com release gerando ou baixando, relê até nenhuma ficar no pipeline', async () => {
    vi.useFakeTimers();
    const baixando = snapshot({ rows: [release({ pipelineState: 'baixando' })] });
    const pronta = snapshot();
    const status = vi.fn().mockResolvedValueOnce(baixando).mockResolvedValueOnce(pronta);
    const initial = snapshot({ rows: [release({ pipelineState: 'gerando' })] });
    const { result } = renderHook(() => useReleasesSnapshot(initial, status, 1000));

    await tick();
    expect(result.current).toBe(baixando);
    await tick();
    expect(result.current).toBe(pronta);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('com a prévia atualizando, relê até ela ficar no ar', async () => {
    vi.useFakeTimers();
    const noAr = snapshot();
    const status = vi.fn().mockResolvedValue(noAr);
    const initial = snapshot({
      preview: preview({ status: 'atualizando', targetRelease: '2.0.0' }),
    });
    const { result } = renderHook(() => useReleasesSnapshot(initial, status, 1000));

    await tick();
    expect(result.current).toBe(noAr);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(status).toHaveBeenCalledTimes(1);
  });

  it('com a atualização em andamento, relê até ela fechar', async () => {
    vi.useFakeTimers();
    const concluida = snapshot({ rollout: rollout('concluida') });
    const status = vi
      .fn()
      .mockResolvedValueOnce(snapshot({ rollout: rollout('em_andamento') }))
      .mockResolvedValueOnce(concluida);
    const initial = snapshot({ rollout: rollout('em_andamento') });
    const { result } = renderHook(() => useReleasesSnapshot(initial, status, 1000));

    await tick();
    await tick();
    expect(result.current).toBe(concluida);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('sem nada andando, não relê', async () => {
    vi.useFakeTimers();
    const status = vi.fn();
    renderHook(() => useReleasesSnapshot(snapshot({ rollout: rollout('falhou') }), status, 1000));

    await act(() => vi.advanceTimersByTimeAsync(5000));

    expect(status).not.toHaveBeenCalled();
  });

  it('sem a leitura, devolve o da página sem reler', async () => {
    vi.useFakeTimers();
    const initial = snapshot({ rollout: rollout('em_andamento') });
    const { result } = renderHook(() => useReleasesSnapshot(initial, undefined, 1000));

    await act(() => vi.advanceTimersByTimeAsync(5000));

    expect(result.current).toBe(initial);
  });

  it('os dados novos da página substituem os do polling', async () => {
    vi.useFakeTimers();
    const status = vi
      .fn()
      .mockResolvedValue(snapshot({ rows: [release({ pipelineState: 'baixando' })] }));
    const { result, rerender } = renderHook(
      ({ initial }) => useReleasesSnapshot(initial, status, 1000),
      { initialProps: { initial: snapshot({ rows: [release({ pipelineState: 'gerando' })] }) } },
    );
    await tick();
    expect(result.current.rows[0]?.pipelineState).toBe('baixando');

    const fromPage = snapshot({ rows: [release({ pipelineState: 'descartada' })] });
    rerender({ initial: fromPage });

    expect(result.current).toBe(fromPage);
  });
});
