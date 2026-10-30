import { useSyncExternalStore } from 'react';

// Roteador do Next em memória para os testes de componente (#459), como o dos `*.test.tsx` com
// happy-dom (`ContentsTable.test.tsx`): a URL fica num store que `useSearchParams` e
// `usePathname` leem e que `router.replace`/`push` gravam. Use no teste com
// `vi.mock('next/navigation', () => import('<caminho>/test/browser/navigation.ts'))`.

let url = '/';
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A URL simulada (caminho e query), para o teste ler e pôr antes do render. */
export const navigation = {
  get: () => url,
  set(next: string) {
    url = next;
    listeners.forEach((listener) => listener());
  },
  /** A query atual, sem o `?`. */
  search: () => url.split('?')[1] ?? '',
};

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => url.split('?')[0]!);
}

export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribe, navigation.search);
  return new URLSearchParams(search);
}

export function useRouter() {
  return {
    replace: (next: string) => navigation.set(next),
    push: (next: string) => navigation.set(next),
    refresh: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    prefetch: () => undefined,
  };
}

export function useParams(): Record<string, string> {
  return {};
}

export function notFound(): never {
  throw new Error('notFound() num teste de componente');
}

export function redirect(to: string): never {
  throw new Error(`redirect(${to}) num teste de componente`);
}
