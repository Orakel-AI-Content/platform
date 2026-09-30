import { describe, expect, it, vi } from 'vitest';

import { parseEventBody } from '../payload.ts';
import { SESSION_IDLE_MS } from '../session.ts';
import { EVENT_ID, memoryStorage, SID } from '../test-builders.ts';
import { createPageviewTracker, LAST_ACTIVITY_KEY, SESSION_KEY } from './tracker.ts';

const T0 = 1_000_000;

function setup(
  options: { storage?: ReturnType<typeof memoryStorage> | undefined; sid?: string } = {},
) {
  const storage = 'storage' in options ? options.storage : memoryStorage();
  const bodies: string[] = [];
  let now = T0;
  const send = vi.fn((body: string) => {
    bodies.push(body);
    return Promise.resolve(options.sid === undefined ? {} : { sid: options.sid });
  });
  const tracker = createPageviewTracker({
    storage,
    send,
    now: () => now,
    uuid: () => EVENT_ID,
  });
  return {
    tracker,
    storage,
    send,
    bodies,
    advance: (ms: number) => (now += ms),
    sent: (i: number) => JSON.parse(bodies[i] ?? 'null') as Record<string, unknown>,
  };
}

describe('createPageviewTracker', () => {
  it('envia um payload que o Worker aceita', async () => {
    const { tracker, bodies } = setup();
    await tracker.trackPageview({ articleId: 42 }, 'https://www.google.com/');
    expect(parseEventBody(bodies[0] ?? '')).toMatchObject({
      ok: true,
      value: { type: 'pageview', page: { articleId: 42 }, referrer: 'https://www.google.com/' },
    });
  });

  it('guarda o sid devolvido e o reenvia enquanto houver atividade', async () => {
    const { tracker, storage, advance, sent } = setup({ sid: SID });
    await tracker.trackPageview({ articleId: 1 });
    expect(storage?.data.get(SESSION_KEY)).toBe(SID);
    expect(sent(0)).not.toHaveProperty('sid');

    advance(SESSION_IDLE_MS - 1);
    await tracker.trackPageview({ articleId: 2 });
    expect(sent(1)).toMatchObject({ sid: SID });
    expect(storage?.data.get(LAST_ACTIVITY_KEY)).toBe(String(T0 + SESSION_IDLE_MS - 1));
  });

  it('descarta o sid após 30 minutos sem atividade', async () => {
    const storage = memoryStorage({ [SESSION_KEY]: SID, [LAST_ACTIVITY_KEY]: String(T0) });
    const { tracker, advance, sent } = setup({ storage });
    advance(SESSION_IDLE_MS + 1);
    await tracker.trackPageview({ articleId: 1 });
    expect(sent(0)).not.toHaveProperty('sid');
    expect(storage.data.has(SESSION_KEY)).toBe(false);
  });

  it('sem sid emitido (região sem sessão), não guarda nada', async () => {
    const { tracker, storage } = setup();
    await tracker.trackPageview({ pageType: 'home', path: '/' });
    expect(storage?.data.size).toBe(0);
  });

  it('omite o campo referrer quando ele vem vazio', async () => {
    const { tracker, sent } = setup();
    await tracker.trackPageview({ articleId: 1 }, '');
    expect(sent(0)).not.toHaveProperty('referrer');
  });

  it('falha no envio perde o evento sem lançar', async () => {
    const { tracker, send, storage } = setup();
    send.mockRejectedValueOnce(new Error('offline'));
    await expect(tracker.trackPageview({ articleId: 1 })).resolves.toBeUndefined();
    expect(storage?.data.size).toBe(0);
  });

  it('segue medindo sem armazenamento ou com armazenamento que lança', async () => {
    const without = setup({ storage: undefined, sid: SID });
    await without.tracker.trackPageview({ articleId: 1 });
    expect(without.send).toHaveBeenCalledOnce();

    const broken = memoryStorage();
    broken.getItem = () => {
      throw new Error('SecurityError');
    };
    broken.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const failing = setup({ storage: broken, sid: SID });
    await failing.tracker.trackPageview({ articleId: 1 });
    expect(failing.send).toHaveBeenCalledOnce();
  });
});
