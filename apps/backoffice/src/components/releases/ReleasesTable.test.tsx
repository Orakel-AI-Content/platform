// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReleaseRecord } from '@/domain/releases/releases.ts';

import { ReleasesTable } from './ReleasesTable.tsx';

// Registro de releases (#509): tag e data no fuso da operação, a mais recente primeiro; busca
// pela tag com o estado na URL (router.replace simulado); sem releases, o estado vazio.

const navigation = vi.hoisted(() => {
  let search = '';
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set: (next: string) => {
      search = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    usePathname: () => '/releases',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(navigation.subscribe, navigation.get)),
    useRouter: () => ({ replace: (url: string) => navigation.set(url.split('?')[1] ?? '') }),
  };
});

afterEach(() => {
  cleanup();
  navigation.set('');
});

const rows: ReleaseRecord[] = [
  { tag: 'core-v1.10.0', registeredAt: new Date('2026-11-02T15:00Z') },
  { tag: 'core-v1.9.0', registeredAt: new Date('2026-10-20T12:30Z') },
];

const tags = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

describe('ReleasesTable', () => {
  it('mostra tag e data no fuso da operação, a mais recente primeiro', () => {
    render(<ReleasesTable rows={rows} />);

    expect(tags()).toEqual(['core-v1.10.0', 'core-v1.9.0']);
    expect(screen.getByText(/02\/11\/2026.*12:00/)).toBeTruthy();
  });

  it('ordena pela tag em ordem numérica', async () => {
    render(<ReleasesTable rows={rows} />);

    await userEvent.click(screen.getByRole('button', { name: /Tag/ }));

    expect(tags()).toEqual(['core-v1.9.0', 'core-v1.10.0']);
  });

  it('busca pela tag', async () => {
    render(<ReleasesTable rows={rows} />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar pela tag' }), '1.9');
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));

    expect(tags()).toEqual(['core-v1.9.0']);
  });

  it('sem releases, o estado vazio com a ação', () => {
    render(
      <ReleasesTable rows={[]} emptyAction={<button type="button">Registrar release</button>} />,
    );

    expect(screen.getByText('Nenhuma release registrada.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registrar release' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
