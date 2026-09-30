// Dados válidos para os testes da v1. Não faz parte da superfície pública.
import type { PageviewPayload } from './payload.ts';

export const EVENT_ID = '0b0f8a52-6b0e-4b8e-9d3a-2f1c5e7a9b10';
export const SID = '5f2d1c3b-8a4e-4f6d-9b7c-1e2a3d4c5b6a';

export function buildPageview(overrides: Partial<PageviewPayload> = {}): PageviewPayload {
  return {
    formatVersion: 1,
    type: 'pageview',
    eventId: EVENT_ID,
    page: { articleId: 42 },
    ...overrides,
  };
}

/** `sessionStorage` em memória. */
export function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}
