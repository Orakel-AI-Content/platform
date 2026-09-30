// Lógica do script de eventos, sem nenhuma API do navegador: tudo chega por parâmetro,
// para ser testada em Node. Só importa tipos e constantes sem Zod (ADR 0004).
import type { PageRef, PageviewPayload, PageviewResponse } from '../payload.ts';
import { SESSION_IDLE_MS } from '../session.ts';
import { FORMAT_VERSION } from '../version.ts';

export const SESSION_KEY = 'orakel:sid';
export const LAST_ACTIVITY_KEY = 'orakel:last-activity';

/** O que o tracker usa do `sessionStorage`. */
export type SessionStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type TrackerDeps = {
  /** `undefined` quando o navegador bloqueia o armazenamento: segue sem sessão. */
  storage: SessionStore | undefined;
  /** Envia o corpo a `/_e/pageview`; devolve a resposta do Worker, se houver. */
  send: (body: string) => Promise<PageviewResponse | undefined>;
  now: () => number;
  uuid: () => string;
};

export function createPageviewTracker(deps: TrackerDeps) {
  // O armazenamento pode lançar (modo privado, cota); a medição nunca quebra a página.
  const read = (key: string): string | null => {
    try {
      return deps.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string | undefined): void => {
    try {
      if (value === undefined) deps.storage?.removeItem(key);
      else deps.storage?.setItem(key, value);
    } catch {
      // sem sessão, segue a medição
    }
  };

  /** `sid` ainda válido: presente e com atividade nos últimos 30 minutos. */
  function currentSid(): string | undefined {
    const sid = read(SESSION_KEY);
    const last = Number(read(LAST_ACTIVITY_KEY));
    if (sid === null || !Number.isFinite(last) || deps.now() - last > SESSION_IDLE_MS) {
      write(SESSION_KEY, undefined);
      write(LAST_ACTIVITY_KEY, undefined);
      return undefined;
    }
    return sid;
  }

  async function trackPageview(page: PageRef, referrer?: string): Promise<void> {
    const sid = currentSid();
    const payload: PageviewPayload = {
      formatVersion: FORMAT_VERSION,
      type: 'pageview',
      eventId: deps.uuid(),
      page,
      ...(referrer ? { referrer } : {}),
      ...(sid === undefined ? {} : { sid }),
    };
    let response: PageviewResponse | undefined;
    try {
      response = await deps.send(JSON.stringify(payload));
    } catch {
      return; // perde o evento, nunca a página
    }
    const nextSid = response?.sid ?? sid;
    if (nextSid !== undefined) {
      write(SESSION_KEY, nextSid);
      write(LAST_ACTIVITY_KEY, String(deps.now()));
    }
  }

  return { trackPageview, currentSid };
}
