import { describe, expect, it, vi } from 'vitest';

import { createManifestCache } from './manifest-cache.ts';

const manifest = { formatVersion: 1, articles: [{ id: 1, path: '/a/' }] };

describe('createManifestCache', () => {
  it('lê uma vez e reaproveita o índice', async () => {
    const load = vi.fn(() => Promise.resolve(manifest));
    const get = createManifestCache(load);
    expect((await get()).get(1)).toBe('/a/');
    await get();
    expect(load).toHaveBeenCalledOnce();
  });

  it('manifesto inválido lança e a próxima chamada tenta de novo', async () => {
    const load = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({ formatVersion: 2 })
      .mockResolvedValueOnce(manifest);
    const get = createManifestCache(load);
    await expect(get()).rejects.toThrow('Manifesto de eventos inválido');
    expect((await get()).get(1)).toBe('/a/');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
