import { describe, expect, it, vi } from 'vitest';

import { pingHeartbeat } from './heartbeat.ts';
import { problem } from './problem.ts';

describe('problem', () => {
  it('responde application/problem+json com status e título', async () => {
    const response = problem(404, 'Site não encontrado');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(await response.json()).toEqual({
      type: 'about:blank',
      title: 'Site não encontrado',
      status: 404,
    });
  });
});

describe('pingHeartbeat', () => {
  it('sem URL não faz nada', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await pingHeartbeat(undefined, 'job', fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('pinga <base>/<nome> e nunca lança', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(await pingHeartbeat('https://hc.exemplo/ping/', 'backup', fetchImpl)).toBe(true);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://hc.exemplo/ping/backup');
    fetchImpl.mockRejectedValueOnce(new Error('rede'));
    expect(await pingHeartbeat('https://hc.exemplo/ping', 'backup', fetchImpl)).toBe(false);
  });
});
