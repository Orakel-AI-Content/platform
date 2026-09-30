import { afterEach, describe, expect, it, vi } from 'vitest';

import { PAGEVIEW_ENDPOINT } from '../routes.ts';
import { memoryStorage, SID } from '../test-builders.ts';
import { startPageviewTracking } from './index.ts';

// Dublês mínimos do navegador: window, document, fetch e crypto.
function stubBrowser(
  response: { ok: boolean; json?: unknown },
  options: { storage?: 'throws' } = {},
) {
  const listeners: Record<string, (event: { persisted: boolean }) => void> = {};
  const storage = memoryStorage();
  const window = {
    get sessionStorage() {
      if (options.storage === 'throws') throw new Error('SecurityError');
      return storage;
    },
    addEventListener: (type: string, listener: (event: { persisted: boolean }) => void) => {
      listeners[type] = listener;
    },
  };
  const fetch = vi.fn(() =>
    Promise.resolve({ ok: response.ok, json: () => Promise.resolve(response.json) }),
  );
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', { referrer: 'https://busca.exemplo/' });
  vi.stubGlobal('fetch', fetch);
  return { fetch, storage, listeners };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('startPageviewTracking', () => {
  it('envia o pageview ao endpoint e guarda o sid devolvido', async () => {
    const { fetch, storage } = stubBrowser({ ok: true, json: { sid: SID } });
    startPageviewTracking({ articleId: 1 });
    await flush();
    expect(fetch).toHaveBeenCalledWith(
      PAGEVIEW_ENDPOINT,
      expect.objectContaining({ method: 'POST', keepalive: true, credentials: 'same-origin' }),
    );
    expect([...storage.data.values()]).toContain(SID);
  });

  it('envia de novo só quando a página volta do bfcache', async () => {
    const { fetch, listeners } = stubBrowser({ ok: true, json: {} });
    startPageviewTracking({ pageType: 'home', path: '/' });
    listeners.pageshow?.({ persisted: false });
    listeners.pageshow?.({ persisted: true });
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('ignora resposta de erro ou sem sid válido', async () => {
    const failed = stubBrowser({ ok: false }, { storage: 'throws' });
    startPageviewTracking({ articleId: 1 });
    await flush();
    expect(failed.fetch).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
    const odd = stubBrowser({ ok: true, json: { sid: 123 } });
    startPageviewTracking({ articleId: 1 });
    await flush();
    expect(odd.storage.data.size).toBe(0);
  });
});
