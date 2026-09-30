// "@orakel/events/v1/client": liga o tracker ao navegador. O blog importa e empacota;
// o orçamento de JS da página confere o peso (1 a 2 kB).
import type { PageRef, PageviewResponse } from '../payload.ts';
import { PAGEVIEW_ENDPOINT } from '../routes.ts';
import { createPageviewTracker, type SessionStore } from './tracker.ts';

export { createPageviewTracker, LAST_ACTIVITY_KEY, SESSION_KEY } from './tracker.ts';
export type { SessionStore, TrackerDeps } from './tracker.ts';
export type { PageRef } from '../payload.ts';

function sessionStore(): SessionStore | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

async function send(body: string): Promise<PageviewResponse | undefined> {
  const response = await fetch(PAGEVIEW_ENDPOINT, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    keepalive: true,
  });
  if (!response.ok) return undefined;
  const json = (await response.json()) as { sid?: unknown };
  return typeof json.sid === 'string' ? { sid: json.sid } : {};
}

/**
 * Envia o pageview agora e de novo quando a página volta do bfcache (`pageshow` com
 * `persisted`). Falhas perdem o evento, nunca a navegação.
 */
export function startPageviewTracking(page: PageRef): void {
  const tracker = createPageviewTracker({
    storage: sessionStore(),
    send,
    now: () => Date.now(),
    uuid: () => crypto.randomUUID(),
  });
  const track = () => void tracker.trackPageview(page, document.referrer || undefined);
  track();
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) track();
  });
}
