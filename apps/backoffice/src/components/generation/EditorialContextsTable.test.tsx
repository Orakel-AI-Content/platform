// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EditorialContext } from '@/domain/generation/editorial-contexts.ts';

import { EditorialContextsTable } from './EditorialContextsTable.tsx';

// Versões do contexto editorial (RN-GEN-05): todas, a mais recente primeiro, com quem criou e
// quando (no fuso do site); sem versões, o estado vazio com a ação de criar.

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
    usePathname: () => '/sites/exemplo-a/contextos',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(navigation.subscribe, navigation.get)),
    useRouter: () => ({ replace: (url: string) => navigation.set(url.split('?')[1] ?? '') }),
  };
});

afterEach(() => {
  cleanup();
  navigation.set('');
});

const version = (n: number, createdBy: string, body: string): EditorialContext => ({
  version: n,
  body,
  createdBy,
  createdAt: new Date(Date.UTC(2026, 10, n, 12)),
});

const rows: EditorialContext[] = [
  version(3, 'editor@orakel.local', 'Tom sério, público adulto.'),
  version(2, 'admin@orakel.local', 'Tom leve.'),
  version(1, 'editor@orakel.local', 'Primeiro contexto.'),
];

const renderTable = (data = rows) =>
  render(<EditorialContextsTable timeZone="America/Sao_Paulo" rows={data} />);

const column = (index: number) =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[index]?.textContent);

describe('tabela de contextos editoriais', () => {
  it('mostra todas as versões, a mais recente primeiro, com quem criou e quando', () => {
    renderTable();

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Versão',
      'Texto',
      'Criada por',
      'Criada em',
    ]);
    expect(column(0)).toEqual(['v3', 'v2', 'v1']);
    expect(column(2)).toEqual(['editor@orakel.local', 'admin@orakel.local', 'editor@orakel.local']);
    expect(column(3)).toEqual([
      '03/11/2026, 09:00 BRT',
      '02/11/2026, 09:00 BRT',
      '01/11/2026, 09:00 BRT',
    ]);
    expect(screen.getByRole('status').textContent).toBe('3 resultados');
  });

  it('busca no texto e por autor', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.type(screen.getByLabelText('Buscar no texto ou por autor'), 'admin');
    expect(column(0)).toEqual(['v2']);
  });

  it('sem versões, o estado vazio com a ação de criar', () => {
    render(
      <EditorialContextsTable
        timeZone="America/Sao_Paulo"
        rows={[]}
        emptyAction={<button type="button">Nova versão</button>}
      />,
    );

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Nenhum contexto editorial salvo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nova versão' })).toBeTruthy();
  });
});
